'use strict';

/**
 * Modal do PIN no viewer: ao abrir, nada conecta sozinho — o modal bloqueia
 * (com blur no fundo) até o usuário digitar o PIN que aparece na tela do
 * celular. PIN inválido dá erro visível; PIN errado (peer-unavailable) reabre
 * o modal para retry. Isso impede que qualquer viewer invada o peer alheio.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createViewerApp, flush } = require('./helpers/harness');

const apertarEnter = (app, campo) => {
  campo.dispatchEvent(new app.window.KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
};

test('modal do PIN já está visível ao abrir e nada conecta sozinho (nem com peer "open")', async () => {
  const app = createViewerApp();

  app.peer.emitPeer('open'); // peer registrado no servidor; mesmo assim ninguém conecta
  await flush();

  assert.equal(app.$('#pin-modal').hidden, false, 'modal bloqueando, aguardando o PIN');
  assert.equal(app.peer.state.connectedTo, null, 'nenhuma conexão parte do viewer sem o PIN');
  assert.equal(app.$('#pin-error').hidden, true, 'sem erro antes da primeira tentativa');
  app.close();
});

test('PIN curtinho mostra erro no modal e NÃO conecta', () => {
  const app = createViewerApp();

  app.type(app.$('#pin-input'), '123');
  app.click(app.$('#pin-btn'));

  assert.equal(app.peer.state.connectedTo, null, 'PIN de 3 dígitos nunca viraria tentativa de conexão');
  assert.equal(app.$('#pin-modal').hidden, false, 'o modal continua aberto para retry');
  assert.equal(app.$('#pin-error').hidden, false, 'o usuário precisa SABER o que faltou');
  assert.match(app.$('#pin-error').innerText, /6/, 'o erro diz o formato esperado (6 dígitos)');
  app.close();
});

test('PIN com letras é barrado igual: 6 dígitos NUMÉRICOS', () => {
  const app = createViewerApp();

  app.type(app.$('#pin-input'), '12ab45');
  app.click(app.$('#pin-btn'));

  assert.equal(app.peer.state.connectedTo, null);
  assert.equal(app.$('#pin-error').hidden, false, 'erro visível — a tentativa não passa em silêncio');
  app.close();
});

test('PIN válido conecta no id digitado (ele é o PeerID do celular) e o modal some', () => {
  const app = createViewerApp();

  app.type(app.$('#pin-input'), '987654');
  app.click(app.$('#pin-btn'));

  assert.equal(
    app.peer.state.connectedTo,
    '987654',
    'conecta exatamente no número digitado — é como encontra o celular certo'
  );
  assert.equal(app.$('#pin-modal').hidden, true, 'modal liberado após a tentativa de conexão');
  assert.equal(app.$('#pin-error').hidden, true, 'sem erro residindo na tela quando conecta');

  app.peer.emitConn('open');
  assert.equal(app.document.getElementById('status').innerText, 'conectado');
  app.close();
});

test('Enter no campo equivale ao botão Conectar', () => {
  const app = createViewerApp();

  app.type(app.$('#pin-input'), '121212');
  apertarEnter(app, app.$('#pin-input'));

  assert.equal(app.peer.state.connectedTo, '121212', 'fluxo pelo teclado existe');
  app.close();
});

test('PIN errado no celular (peer-unavailable): modal volta com aviso para retry', () => {
  const app = createViewerApp();

  app.type(app.$('#pin-input'), '555555');
  app.click(app.$('#pin-btn'));
  assert.equal(app.$('#pin-modal').hidden, true);

  app.peer.emitPeer('error', { type: 'peer-unavailable' });

  assert.equal(app.$('#pin-modal').hidden, false, 'modal reabre — sem conexão, o app não avança');
  assert.equal(app.$('#pin-error').hidden, false, 'erro explícito, nenhuma falha silenciosa');
  assert.match(app.$('#pin-error').innerText, /PIN|celular/i, 'erro fala do PIN/celular');
  app.close();
});
