'use strict';

/**
 * Busca manual de chave no viewer: o usuário digita a chave de acesso (44
 * dígitos) e o painel busca a nota SEM o celular conectado. A busca entra na
 * MESMA fila da leitura por OCR (dedup, ritmo de 1s, cards) — não pode existir
 * caminho paralelo de consulta.
 *
 * Intenção de cada garantia:
 * - formato errado → aviso visível e NENHUMA consulta: erro de digitação não
 *   pode gastar rate-limit da API nem virar card fantasminha;
 * - chave repetida → aviso + foco no card existente: em busca manual o
 *   silêncio do dedup (ok no automático do celular) parece bug;
 * - sem conexão Peer → funciona: o campo existe justamente para usar o painel
 *   sem o celular;
 * - link no modal → libera a tela sem conectar: pular não é conectar.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createViewerApp, jsonResponse, flush } = require('./helpers/harness');
const {
  CHAVE_UMA,
  CHAVE_TRES,
  CNPJ_UMA,
  FORNECEDOR,
  xmlNota,
  respostaPrimaria,
} = require('./helpers/fixtures');

function criarApp({ primaria, receita } = {}) {
  const app = createViewerApp();
  app.fetch.on('/api/nfe/fallback/', () => { throw new Error('fallback não deveria ser chamado no cenário feliz'); });
  app.fetch.on('/api/nfe/', primaria || (() => jsonResponse(respostaPrimaria(xmlNota()))));
  app.fetch.on('/receita/', receita || (() => jsonResponse({ nome: FORNECEDOR })));
  return app;
}

const apertarEnter = (app, campo) => {
  campo.dispatchEvent(new app.window.KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
};

function buscarManual(app, chave) {
  app.type(app.$('#manual-key'), chave);
  app.click(app.$('#manual-search-btn'));
}


test('chave com tamanho errado: aviso no campo e nenhuma consulta é feita', () => {
  const app = criarApp();

  buscarManual(app, CHAVE_UMA.slice(0, 43)); // um dígito faltando

  assert.equal(app.$('#manual-error').hidden, false, 'erro visível — busca que não roda não pode ficar em silêncio');
  assert.match(app.$('#manual-error').innerText, /44/, 'a mensagem diz o formato esperado');
  assert.equal(app.app.pendingScans.length, 0, 'nada entra na fila');
  assert.equal(app.app.scans.length, 0, 'nenhum card nasce');
  assert.equal(app.fetch.calls.length, 0, 'formato errado não gasta consulta');
  app.close();
});


test('chave só com letras é barrada igual (o que vale são 44 dígitos)', () => {
  const app = criarApp();

  buscarManual(app, 'nenhuma chave aqui');

  assert.equal(app.$('#manual-error').hidden, false);
  assert.equal(app.app.pendingScans.length, 0);
  assert.equal(app.fetch.calls.length, 0);
  app.close();
});


test('chave válida: enfileira, processa pelo pipeline do celular e limpa o campo', async () => {
  const app = criarApp();

  buscarManual(app, CHAVE_UMA);
  await flush();

  assert.equal(app.peer.state.connectedTo, null, 'funciona sem ter conectado no celular (nenhum PIN digitado)');
  assert.equal(app.app.pendingScans.length, 0, 'fila esvaziada — processou na hora, como a leitura do celular');

  const scan = app.app.scans[0];
  assert.ok(scan, 'o card da nota existe');
  assert.equal(scan.status, 'success');
  assert.equal(scan.cnpj, CNPJ_UMA);
  assert.equal(app.app.selectedScanId, scan.id, 'a nota buscada ganha foco');
  assert.equal(app.$('#manual-key').value, '', 'campo limpo para a próxima busca');
  assert.equal(app.$('#manual-error').hidden, true, 'sem erro residual quando dá certo');
  app.close();
});


test('Enter no campo equivale ao botão Buscar', async () => {
  const app = criarApp();

  app.type(app.$('#manual-key'), CHAVE_UMA);
  apertarEnter(app, app.$('#manual-key'));
  await flush();

  assert.equal(app.app.scans.length, 1, 'fluxo pelo teclado existe');
  assert.equal(app.fetch.calls.length, 2, 'consultou fornecedor + xml uma única vez');
  app.close();
});


test('chave colada com espaços/pontuação é normalizada (só os 44 dígitos importam)', async () => {
  const app = criarApp();

  const formatada = CHAVE_UMA.replace(/(\d{4})(?=\d)/g, '$1 ');
  buscarManual(app, formatada);
  await flush();

  assert.equal(app.$('#manual-error').hidden, true, 'formatação da cópia não vira erro');
  assert.equal(app.app.scans.length, 1, 'a nota é encontrada');
  assert.equal(app.app.scans[0].key, CHAVE_UMA, 'guarda a chave sem formatação');
  app.close();
});


test('chave repetida: aviso + foco no card existente, sem consulta repetida', async () => {
  const app = criarApp();

  buscarManual(app, CHAVE_UMA);
  await flush();
  const chamadas = app.fetch.calls.length;

  buscarManual(app, CHAVE_UMA);
  await flush();

  assert.equal(app.$('#manual-error').hidden, false, 'duplicata avisa — silêncio parece bug na busca manual');
  assert.match(app.$('#manual-error').innerText, /lista/, 'a mensagem diz que a chave já está na lista');
  assert.equal(app.app.scans.length, 1, 'não vira segundo card');
  assert.equal(app.fetch.calls.length, chamadas, 'sem consulta repetida (proteção contra 429)');
  assert.equal(app.app.selectedScanId, app.app.scans[0].id, 'a busca leva o foco ao card já existente');
  app.close();
});


test('chave ainda em processamento (na fila) também é barrada como repetida', () => {
  const app = criarApp();

  app.app.pendingScans.push({ type: 'nfe', key: CHAVE_TRES }); // em espera, fora de scans

  buscarManual(app, CHAVE_TRES);

  assert.equal(app.$('#manual-error').hidden, false, 'fila conta como "já está na lista" — evita o card duplicado');
  assert.equal(app.app.pendingScans.length, 1, 'não enfileira a mesma chave duas vezes');
  assert.equal(app.fetch.calls.length, 0, 'nenhuma consulta dispara sozinha');
  app.close();
});


test('link "buscar chave manualmente" no modal: libera a tela sem PIN e sem tocar no peer', () => {
  const app = createViewerApp();

  assert.equal(app.$('#pin-modal').hidden, false, 'modal aberto ao abrir a página');
  assert.ok(app.$('#manual-skip'), 'a saída para a busca manual existe');

  app.click(app.$('#manual-skip'));

  assert.equal(app.$('#pin-modal').hidden, true, 'tela liberada para usar o painel sem celular');
  assert.equal(app.peer.state.connectedTo, null, 'pular NÃO é conectar — nenhum peer é chamado');
  app.close();
});
