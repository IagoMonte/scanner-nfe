'use strict';

/**
 * "Conectado" na tela sem canal faz o operador achar que as leituras estão
 * chegando. Toda queda precisa voltar ao modal do PIN, com o motivo.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createViewerApp } = require('./helpers/harness');

const tentar = (app, pin = '987654') => {
  app.type(app.$('#pin-input'), pin);
  app.click(app.$('#pin-btn'));
};
const status = (app) => app.document.getElementById('status').innerText;
const modalComErro = (app) => {
  assert.equal(app.$('#pin-modal').hidden, false);
  assert.equal(app.$('#pin-error').hidden, false);
};

test('conexão que não abre em 15s volta ao modal', async () => {
  const app = createViewerApp();
  tentar(app);

  await app.clock.advance(15000);

  modalComErro(app);
  assert.equal(status(app), 'desconectado');
  assert.equal(app.peer.state.conn.closed, true);
  app.close();
});

test('conexão aberta no prazo continua depois de 15s', async () => {
  const app = createViewerApp();
  app.connect();
  await app.clock.advance(60000);
  assert.equal(status(app), 'conectado');
  assert.equal(app.$('#pin-modal').hidden, true);
  app.close();
});

for (const [nome, derrubar] of [
  ['WebRTC "failed"', (app) => app.peer.state.conn.peerConnection.mudar('failed')],
  ['erro no canal', (app) => app.peer.emitConn('error', new Error('x'))],
]) {
  test(`queda do celular (${nome}) volta ao modal`, () => {
    const app = createViewerApp();
    app.connect();
    derrubar(app);
    modalComErro(app);
    assert.equal(status(app), 'desconectado');
    app.close();
  });
}

test('PIN não encontrado mantém o aviso próprio, sem ser trocado pelo prazo', async () => {
  const app = createViewerApp();
  tentar(app);
  app.peer.emitPeer('error', { type: 'peer-unavailable' });

  await app.clock.advance(20000);

  assert.match(app.$('#pin-error').innerText, /PIN errado/);
  app.close();
});

test('evento atrasado de uma tentativa antiga não derruba a conexão atual', () => {
  const app = createViewerApp();
  tentar(app, '111111');
  const fechar = app.peer.state.connHandlers.close[0];
  app.peer.emitPeer('error', { type: 'peer-unavailable' });
  app.connect('222222');

  fechar();

  assert.equal(status(app), 'conectado');
  assert.equal(app.$('#pin-modal').hidden, true);
  app.close();
});

test('sair da página avisa o celular (destroi o peer)', () => {
  const app = createViewerApp();
  app.window.dispatchEvent(new app.window.Event('pagehide'));
  assert.equal(app.peer.state.instance.destroyed, true);
  app.close();
});

test('servidor de sinalização caiu: o painel reconecta; destruído, não', async () => {
  const app = createViewerApp();
  app.peer.state.instance.disconnected = true;
  app.peer.emitPeer('disconnected');
  await app.clock.advance(3000);
  assert.equal(app.peer.state.reconnects, 1);

  app.peer.state.instance.destroyed = true;
  app.peer.emitPeer('disconnected');
  await app.clock.advance(3000);
  assert.equal(app.peer.state.reconnects, 1);
  app.close();
});

test('estados passageiros do WebRTC não derrubam a conexão', () => {
  const app = createViewerApp();
  app.connect();
  for (const estado of ['connecting', 'disconnected', 'connected']) app.peer.state.conn.peerConnection.mudar(estado);
  assert.equal(status(app), 'conectado');
  assert.equal(app.$('#pin-modal').hidden, true);
  app.close();
});

test('aviso atrasado de PIN não encontrado não derruba quem já está conectado', () => {
  const app = createViewerApp();
  app.connect();

  app.peer.emitPeer('error', { type: 'peer-unavailable' });

  assert.equal(app.$('#pin-modal').hidden, true);
  app.peer.emitConn('close');
  modalComErro(app); // e a queda real continua sendo percebida
  app.close();
});

test('Enter repetido não abre uma segunda tentativa por cima da primeira', () => {
  const app = createViewerApp();
  tentar(app);
  const primeira = app.peer.state.conn;

  app.$('#pin-input').dispatchEvent(new app.window.KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));

  assert.equal(app.peer.state.conn, primeira);
  app.close();
});

test('o painel usa ID próprio, para se recuperar se o servidor falhar na abertura', () => {
  // sem ID próprio o PeerJS destrói o peer quando não consegue um do servidor
  const app = createViewerApp();
  assert.match(app.peer.state.peerIds[0], /^painel-[a-z0-9]{6,}$/);
  app.close();
});
