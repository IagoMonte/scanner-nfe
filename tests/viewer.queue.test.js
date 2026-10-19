'use strict';

/**
 * Fila de processamento e agendamentos: as duas proteções de tempo do sistema —
 * 1s entre consultas (evita 429 da API) e 15s de auto-exclusão do card de erro.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createViewerApp, flush, jsonResponse } = require('./helpers/harness');
const {
  CHAVE_UMA,
  CHAVE_DUAS,
  CHAVE_TRES,
  CHAVE_CNPJ_INVALIDO,
  FORNECEDOR,
  xmlNota,
  respostaPrimaria,
} = require('./helpers/fixtures');

function criarApp() {
  const app = createViewerApp();
  app.fetch.on('/api/nfe/fallback/', () => { throw new Error('fallback não deveria ser chamado'); });
  app.fetch.on('/api/nfe/', () => jsonResponse(respostaPrimaria(xmlNota())));
  app.fetch.on('/receita/', () => jsonResponse({ nome: FORNECEDOR }));
  return app;
}

const chavesDePost = (app) => app.fetch.calls
  .filter((c) => c.method === 'POST')
  .map((c) => JSON.parse(c.body).chave);

test('fila processa uma nota por vez, com 1s de espera entre cada consulta', { timeout: 5000 }, async () => {
  const app = criarApp();

  app.connect();
  assert.equal(app.peer.state.connectedTo, 'phone-ocr', 'o viewer se conecta no id fixo do celular');

  // Três leituras chegam juntas: só a primeira pode consultar agora.
  app.emit({ type: 'nfe', key: CHAVE_UMA });
  app.emit({ type: 'nfe', key: CHAVE_DUAS });
  app.emit({ type: 'nfe', key: CHAVE_TRES });

  // Guarda de isProcessing: chamar de novo durante o processamento não puxa da fila.
  await app.app.processNextScan();
  assert.equal(app.app.pendingScans.length, 2, 'fila com as duas leituras restantes');
  assert.equal(app.fetch.calls.length, 2, 'só a primeira nota consultou (fornecedor + xml)');

  await flush();
  assert.equal(app.app.scans.length, 1, 'a segunda nota ainda nem virou card');
  assert.equal(app.app.pendingScans.length, 2);

  await app.clock.advance(999);
  assert.equal(app.fetch.calls.length, 2, 'antes de 1s nenhuma nova consulta (ritmo anti-429)');
  assert.equal(app.app.scans.length, 1);

  await app.clock.advance(20);
  assert.equal(app.app.scans.length, 2, 'a segunda nota começou depois do intervalo');
  assert.equal(app.fetch.calls.length, 4);

  await app.clock.advance(1100);
  assert.equal(app.app.scans.length, 3, 'terceira nota processada');
  assert.equal(app.app.pendingScans.length, 0);
  assert.deepEqual(chavesDePost(app), [CHAVE_UMA, CHAVE_DUAS, CHAVE_TRES], 'ordem de chegada preservada');
  assert.ok(
    app.app.scans.every((s) => s.status === 'success'),
    'todas as notas da fila terminam válidas'
  );
  app.close();
});

test('a fila continua mesmo quando uma nota falha (erro não trava o processamento)', { timeout: 5000 }, async () => {
  const app = criarApp();
  app.connect();

  app.emit({ type: 'nfe', key: CHAVE_CNPJ_INVALIDO });
  app.emit({ type: 'nfe', key: CHAVE_UMA });
  await flush();

  assert.equal(app.app.scans[0].status, 'error', 'a primeira (chave inválida) vira erro');
  assert.equal(app.app.pendingScans.length, 1, 'a seguinte segue na fila');

  await app.clock.advance(1100);
  assert.equal(app.app.scans.length, 2);
  assert.equal(app.app.scans.find((s) => s.key === CHAVE_UMA).status, 'success');
  app.close();
});

test('card de erro é auto-apagado em 15s e a lista volta a ficar vazia', { timeout: 5000 }, async () => {
  const app = criarApp();

  await app.app.processScan({ type: 'nfe', key: CHAVE_CNPJ_INVALIDO });
  const scan = app.app.scans[0];
  assert.equal(scan.status, 'error');
  assert.ok(scan.deleteAt, 'prazo de exclusão marcado');
  assert.equal(
    Math.ceil((scan.deleteAt - Date.now()) / 1000),
    15,
    'o prazo é de 15 segundos a partir de agora'
  );

  // Enquanto existe prazo, a lista avisa em vez de mostrar o número da NF.
  assert.match(app.$('.list-item .timer').textContent, /^apaga em \d+s$/);
  assert.match(app.document.getElementById('detail-view').innerHTML, /Exclusão automática em \d+s/);
  assert.match(app.document.getElementById('detail-view').innerHTML, /Apagar Card/, 'também dá para apagar na hora');

  await app.clock.advance(14000);
  assert.equal(app.app.scans.length, 1, 'ainda não apaga antes dos 15s');

  await app.clock.advance(1100);
  assert.equal(app.app.scans.length, 0, 'o timer removeu o card');
  assert.equal(app.document.getElementById('scan-count').textContent, '0');
  assert.match(app.document.getElementById('detail-view').innerHTML, /empty-state/, 'detalhe volta ao estado vazio');
  app.close();
});

test('apagar manualmente cancela o agendamento (o timer não pode ressuscitar nada)', { timeout: 5000 }, async () => {
  const app = criarApp();

  await app.app.processScan({ type: 'nfe', key: CHAVE_CNPJ_INVALIDO });
  const scan = app.app.scans[0];
  assert.ok(scan.deleteTimer);

  app.click(app.$('.manual-delete-btn'));
  assert.equal(app.app.scans.length, 0, 'apagou na hora');
  assert.equal(app.clock.has(scan.deleteTimer), false, 'o timer de auto-exclusão foi cancelado junto');

  // Se o timer antigo disparasse, removerScan de id morto seria inócuo — mas o
  // importante é que a fila de timers não fique acumulando.
  await app.clock.advance(30000);
  assert.equal(app.app.scans.length, 0);
  app.close();
});
