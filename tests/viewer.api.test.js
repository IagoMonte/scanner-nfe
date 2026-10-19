'use strict';

/**
 * Consulta de XML da nota (produtos) e do fornecedor, incluindo o caminho de
 * fallback: é a parte mais frágil do sistema (rede, timeout, respostas malformadas).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createViewerApp, jsonResponse } = require('./helpers/harness');
const {
  CHAVE_UMA,
  FORNECEDOR,
  PRODUTOS_PADRAO,
  xmlNota,
  respostaPrimaria,
  respostaFallback,
} = require('./helpers/fixtures');

/**
 * Importante: a URL do fallback CONTÉM o caminho da primária ("/api/nfe/"),
 * então a rota do fallback precisa ser registrada antes.
 */
function criarApp({ primaria, fallback, receita } = {}) {
  const app = createViewerApp();
  app.fetch.on('/api/nfe/fallback/', fallback || (() => { throw new Error('fallback não deveria ser chamado'); }));
  app.fetch.on('/api/nfe/', primaria || (() => { throw new Error('API primária não deveria ser chamada'); }));
  app.fetch.on('/receita/', receita || (() => jsonResponse({ nome: FORNECEDOR })));
  return app;
}

test('produtosbyxml usa a API primária e devolve nome/quantidade/unidade de cada produto', async () => {
  const app = criarApp({ primaria: () => jsonResponse(respostaPrimaria(xmlNota())) });

  const produtos = await app.app.produtosbyxml(CHAVE_UMA);

  assert.equal(app.fetch.calls.length, 1, 'com a primária funcionando não há chamada extra');
  const [chamada] = app.fetch.calls;
  assert.equal(chamada.method, 'POST');
  assert.ok(chamada.url.endsWith('/api/nfe/'), `URL errada: ${chamada.url}`);
  assert.deepEqual(JSON.parse(chamada.body), { chave: CHAVE_UMA }, 'a chave vai no corpo JSON');

  assert.equal(produtos.length, PRODUTOS_PADRAO.length);
  // clone no realm do teste: os objetos vêm do realm do jsdom (prototype diferente)
  assert.deepEqual({ ...produtos[0] }, {
    nome: 'REAGENTE QUIMICO 500ML',
    quantidade: '10.0000',
    unidade: 'UN',
    fabricacao: '',
    validadeMeses: '',
  }, 'produto nasce sem fabricação/validade preenchidas');
  assert.equal(produtos[1].nome, 'LUVA NITRILICA P');
  assert.equal(produtos[1].quantidade, '24.0000');
  assert.equal(produtos[1].unidade, 'CX');
});

test('produtosbyxml ignora item sem nome para não poluir a planilha com linha vazia', async () => {
  const xml = xmlNota([
    { nome: '', quantidade: '5.0000', unidade: 'UN' },
    { nome: 'PRODUTO OK', quantidade: '1.0000', unidade: 'UN' },
  ]);
  const app = criarApp({ primaria: () => jsonResponse(respostaPrimaria(xml)) });

  const produtos = await app.app.produtosbyxml(CHAVE_UMA);
  assert.equal(produtos.length, 1);
  assert.equal(produtos[0].nome, 'PRODUTO OK');
});

test('produtosbyxml lança erro quando o XML não tem nenhum produto', async () => {
  const app = criarApp({ primaria: () => jsonResponse(respostaPrimaria('<nfeProc></nfeProc>')) });
  await assert.rejects(
    () => app.app.produtosbyxml(CHAVE_UMA),
    /Nenhum produto encontrado no XML\./,
    'nota sem produto precisa virar erro visível, não card vazio'
  );
});

test('produtosbyxml lança erro quando o XML vem malformado', async () => {
  const app = criarApp({ primaria: () => jsonResponse(respostaPrimaria('<nfe><det><xProd>x</xProd>')) });
  await assert.rejects(
    () => app.app.produtosbyxml(CHAVE_UMA),
    /XML inválido retornado pela API\./
  );
});

test('produtosbyxml cai no fallback quando a primária responde status diferente de ok', async () => {
  const app = criarApp({
    primaria: () => jsonResponse({ status: 'error', mensagem: 'chave nao encontrada' }),
    fallback: () => jsonResponse(respostaFallback(xmlNota())),
  });

  const produtos = await app.app.produtosbyxml(CHAVE_UMA);

  assert.equal(produtos.length, PRODUTOS_PADRAO.length, 'fallback deve entregar os produtos');
  assert.equal(app.fetch.urlsFor('/api/nfe/fallback/').length, 1, 'fallback chamado exatamente uma vez');
  assert.ok(
    app.fetch.urlsFor('/api/nfe/fallback/')[0].endsWith(`/api/nfe/fallback/${CHAVE_UMA}`),
    'a chave entra na URL do fallback'
  );
});

test('produtosbyxml cai no fallback quando a primária devolve HTTP de erro ou falha de rede', async () => {
  const casos = [
    ['HTTP 500', () => jsonResponse({ qualquer: 'coisa' }, { ok: false, status: 500 })],
    ['rede recusada', () => { throw new Error('ECONNRESET'); }],
  ];

  for (const [nome, primaria] of casos) {
    const app = criarApp({ primaria, fallback: () => jsonResponse(respostaFallback(xmlNota())) });
    const produtos = await app.app.produtosbyxml(CHAVE_UMA);
    assert.equal(produtos.length, PRODUTOS_PADRAO.length, `fallback falhou no caso: ${nome}`);
    assert.equal(app.fetch.urlsFor('/api/nfe/fallback/').length, 1, `fallback não chamado no caso: ${nome}`);
    app.close();
  }
});

test('produtosbyxml aborta a primária por volta dos 15s e tenta o fallback', { timeout: 5000 }, async () => {
  const app = criarApp({
    primaria: (chamada) => new Promise((resolve, reject) => {
      if (!chamada.signal) {
        reject(new Error('primária sem AbortController: o timeout não consegue abortar'));
        return;
      }
      chamada.signal.addEventListener('abort', () => {
        const erro = new Error('The operation was aborted');
        erro.name = 'AbortError';
        reject(erro);
      });
    }),
    fallback: () => jsonResponse(respostaFallback(xmlNota())),
  });

  let concluido = false;
  const promessa = app.app.produtosbyxml(CHAVE_UMA).then((produtos) => {
    concluido = true;
    return produtos;
  });

  await app.clock.advance(14000);
  assert.equal(concluido, false, 'não pode desistir antes do timeout');

  await app.clock.advance(1500);
  const produtos = await promessa;
  assert.equal(produtos.length, PRODUTOS_PADRAO.length, 'timeout precisa terminar em fallback, não em erro');
  assert.equal(app.fetch.urlsFor('/api/nfe/fallback/').length, 1);
  app.close();
});

test('produtosbyxml propaga a falha quando também o fallback responde mal', async () => {
  const app = criarApp({
    primaria: () => { throw new Error('sem rede'); },
    fallback: () => jsonResponse({ nada: 'aqui' }, { ok: false, status: 503 }),
  });

  await assert.rejects(
    () => app.app.produtosbyxml(CHAVE_UMA),
    /Falha no fallback: HTTP 503/,
    'erro do fallback precisa dizer o status para depuração'
  );
});

test('produtosbyxml detecta fallback sem o XML na resposta', async () => {
  const app = criarApp({
    primaria: () => { throw new Error('sem rede'); },
    fallback: () => jsonResponse({ outraCoisa: 'ok' }),
  });

  await assert.rejects(
    () => app.app.produtosbyxml(CHAVE_UMA),
    /Estrutura de resposta do fallback não contém xmlCode\./
  );
});

test('buscarFornecedor devolve o nome fantasia da receita', async () => {
  const app = criarApp({ receita: () => jsonResponse({ status: 'OK', nome: FORNECEDOR }) });

  assert.equal(await app.app.buscarFornecedor('03157268000200'), FORNECEDOR);
  const [chamada] = app.fetch.calls;
  assert.equal(chamada.method, 'GET');
  assert.ok(chamada.url.endsWith('/receita/v1/cnpj/03157268000200'));
});

test('buscarFornecedor devolve vazio quando a receita não traz nome (cnpj inexistente)', async () => {
  const app = criarApp({ receita: () => jsonResponse({ status: 'FAILED', message: 'Consultar limite' }) });
  assert.equal(await app.app.buscarFornecedor('00000000000000'), '');
});

test('buscarFornecedor propaga a falha de rede para o processamento tratar como erro', async () => {
  const app = criarApp({ receita: () => { throw new Error('offline'); } });
  await assert.rejects(() => app.app.buscarFornecedor('03157268000200'), /offline/);
});

test.skip('acentos sobrevivem ao decode base64 da API primária (BUG atual: atob quebra UTF-8)', () => {
  // Intenção: <xProd>LUVA DE NITRILICA Ç/Ã</xProd> deve chegar idêntico ao painel.
  // Motivo do skip: a API primária decodifica com atob (latin1), então nomes com acento
  // chegam como "Ã‡..." e o fallback (string pura) chega certo — comportamento divergente.
  // Corrigir na refatoração (ex.: decode UTF-8 via TextDecoder) e desativar o skip.
});
