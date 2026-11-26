'use strict';

/**
 * Download do XML e do PDF (DANFE): os arquivos vão para a contabilidade/arquivo,
 * então precisam sair byte a byte como a consulta entregou (o XML é assinado) e
 * pertencer à nota do card clicado.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createViewerApp, jsonResponse, flush } = require('./helpers/harness');
const {
  CHAVE_UMA,
  CHAVE_DUAS,
  FORNECEDOR,
  xmlNota,
  respostaPrimaria,
  respostaFallback,
} = require('./helpers/fixtures');

const XML_ACENTUADO = xmlNota([{ nome: 'ÁLCOOL ETÍLICO – SOLUÇÃO', quantidade: '2.0000', unidade: 'UN' }]);

/** PDF falso com bytes acima de 127: pega qualquer conversão para texto no caminho. */
const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x00, 0xe2, 0xe3, 0xcf, 0xd3, 0xff]);
const PDF_BASE64 = PDF.toString('base64');

function criarApp({ primaria, fallback, receita } = {}) {
  const app = createViewerApp();
  app.fetch.on('/api/nfe/fallback/', fallback || (() => { throw new Error('fallback não deveria ser chamado'); }));
  app.fetch.on('/api/nfe/', primaria || (() => jsonResponse(respostaPrimaria(XML_ACENTUADO, PDF_BASE64))));
  app.fetch.on('/receita/', receita || (() => jsonResponse({ nome: FORNECEDOR })));
  app.connect();
  return app;
}

function bytes(app, blob) {
  return new Promise((resolve, reject) => {
    const leitor = new app.window.FileReader();
    leitor.onload = () => resolve(Buffer.from(new Uint8Array(leitor.result)));
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsArrayBuffer(blob);
  });
}

const botao = (app, tipo) => app.$(`#detail-view .download-btn[data-tipo="${tipo}"]`);

async function conferirDownloads(app, xmlEsperado) {
  assert.equal(app.downloads.length, 0, 'nada é baixado sem o clique');

  app.click(botao(app, 'xml'));
  app.click(botao(app, 'pdf'));

  const [xml, pdf] = app.downloads;
  assert.equal(app.downloads.length, 2);
  assert.equal(xml.nome, `NFe-${CHAVE_UMA}.xml`);
  assert.equal(xml.blob.type, 'application/xml');
  assert.deepEqual(await bytes(app, xml.blob), Buffer.from(xmlEsperado, 'utf8'));
  assert.equal(pdf.nome, `NFe-${CHAVE_UMA}.pdf`);
  assert.equal(pdf.blob.type, 'application/pdf');
  assert.deepEqual(await bytes(app, pdf.blob), PDF);
}

test('API primária: baixa XML e PDF com os bytes originais, nomeados pela chave', async () => {
  const app = criarApp();
  await app.sendKey(CHAVE_UMA);
  await flush();

  await conferirDownloads(app, XML_ACENTUADO);
  app.close();
});

test('API reserva: os mesmos dois downloads', async () => {
  const app = criarApp({
    primaria: () => { throw new Error('sem rede'); },
    fallback: () => jsonResponse(respostaFallback(XML_ACENTUADO, PDF_BASE64)),
  });
  await app.sendKey(CHAVE_UMA);
  await flush();

  await conferirDownloads(app, XML_ACENTUADO);
  app.close();
});

test('sem PDF utilizável a nota continua válida, o XML baixa e o botão do PDF avisa', async () => {
  for (const pdfRuim of [undefined, '', '@@não é base64@@', 12345]) {
    const app = criarApp({ primaria: () => jsonResponse(respostaPrimaria(XML_ACENTUADO, pdfRuim)) });
    await app.sendKey(CHAVE_UMA);
    await flush();

    assert.equal(app.app.scans[0].status, 'success', `PDF ${pdfRuim} não pode derrubar a nota`);
    assert.equal(botao(app, 'pdf').disabled, true);
    assert.equal(botao(app, 'pdf').title, 'PDF não disponível');
    assert.equal(botao(app, 'xml').disabled, false);

    app.click(botao(app, 'pdf'));
    assert.equal(app.downloads.length, 0, 'nunca entregar PDF vazio ou corrompido');
    app.click(botao(app, 'xml'));
    assert.equal(app.downloads.length, 1);
    app.close();
  }
});

test('cada card baixa os arquivos da própria nota', async () => {
  const xmlPorChave = {
    [CHAVE_UMA]: xmlNota([{ nome: 'DA PRIMEIRA', quantidade: '1.0000', unidade: 'UN' }]),
    [CHAVE_DUAS]: xmlNota([{ nome: 'DA SEGUNDA', quantidade: '1.0000', unidade: 'UN' }]),
  };
  const app = criarApp({
    primaria: (chamada) => jsonResponse(respostaPrimaria(xmlPorChave[JSON.parse(chamada.body).chave], PDF_BASE64)),
  });
  await app.sendKey(CHAVE_UMA);
  await app.sendKey(CHAVE_DUAS);
  await app.clock.advance(1500);

  for (const chave of [CHAVE_UMA, CHAVE_DUAS]) {
    const scan = app.app.scans.find((s) => s.key === chave);
    app.click(app.$(`#card-list [data-scan-id="${scan.id}"]`));
    app.click(botao(app, 'xml'));

    const baixado = app.downloads.at(-1);
    assert.equal(baixado.nome, `NFe-${chave}.xml`);
    assert.deepEqual(await bytes(app, baixado.blob), Buffer.from(xmlPorChave[chave], 'utf8'));
  }
  app.close();
});

test('card em leitura ou com erro não oferece download', async () => {
  let responder;
  const app = criarApp({ receita: () => new Promise((resolve) => { responder = resolve; }) });
  await app.sendKey(CHAVE_UMA);

  assert.equal(app.$$('.download-btn').length, 0, 'ainda lendo');

  responder(jsonResponse({}));
  await flush();

  assert.equal(app.app.scans[0].status, 'error');
  assert.equal(app.$$('.download-btn').length, 0, 'nota com erro');
  app.close();
});
