'use strict';

/**
 * Painel que some sem avisar (navegador morto, rede caída, conexão que nunca abre)
 * não pode prender o celular: o próximo operador seria recusado e a captura diria
 * "chave enviada" para ninguém.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createPhoneApp, flush } = require('./helpers/harness');
const { CHAVE_UMA } = require('./helpers/fixtures');

const status = (app) => app.document.getElementById('status').innerText;
const abrir = async () => { const app = createPhoneApp(); await flush(); return app; };
const novoPainelEntra = (app) => {
  const novo = app.novaConexao();
  novo.conn.emit('open');
  assert.equal(novo.conn.closed, false, 'o painel seguinte precisa ser aceito');
  assert.equal(status(app), 'viewer conectado');
};

test('conexão que nunca abre é descartada após 15s', async () => {
  const app = await abrir();
  const presa = app.novaConexao();
  assert.notEqual(status(app), 'viewer conectado', 'pendente não é conectado');

  await app.clock.advance(14999);
  assert.equal(presa.conn.closed, false, 'dentro do prazo ainda pode abrir');
  await app.clock.advance(1);

  assert.equal(presa.conn.closed, true);
  novoPainelEntra(app);
  app.close();
});

test('conexão aberta no prazo não é derrubada depois', async () => {
  const app = await abrir();
  const viva = app.novaConexao();
  viva.conn.emit('open');
  await app.clock.advance(60000);
  assert.equal(viva.conn.closed, false);
  app.close();
});

test('queda abrupta (WebRTC "failed" sem evento close) libera o celular', async () => {
  const app = await abrir();
  const morta = app.novaConexao();
  morta.conn.emit('open');

  morta.conn.peerConnection.mudar('failed');

  assert.equal(status(app), 'viewer desconectado');
  novoPainelEntra(app);
  app.close();
});

test('erro no canal também libera; evento atrasado do antigo não derruba o novo', async () => {
  const app = await abrir();
  const antiga = app.novaConexao();
  antiga.conn.emit('open');
  antiga.conn.emit('error', new Error('x'));
  assert.equal(status(app), 'viewer desconectado');

  novoPainelEntra(app);
  antiga.conn.emit('close');

  assert.equal(status(app), 'viewer conectado');
  app.close();
});

test('canal ainda fechado: capturar avisa em vez de fingir envio', async () => {
  const app = await abrir();
  const pendente = app.novaConexao();
  app.ocr.text = CHAVE_UMA;

  await app.phone.processOCR();

  assert.deepEqual(app.alerts, ['viewer não conectado']);
  assert.equal(pendente.sent.length, 0);
  app.close();
});

test('painel cai durante o OCR: a chave lida aparece e o celular diz que não enviou', async () => {
  const app = await abrir();
  const viva = app.novaConexao();
  viva.conn.emit('open');
  app.window.Tesseract.recognize = async () => { viva.conn.close(); return { data: { text: CHAVE_UMA } }; };

  await app.phone.processOCR();

  assert.equal(app.document.getElementById('last-key').innerText, CHAVE_UMA);
  assert.equal(status(app), 'chave não enviada');
  assert.equal(viva.sent.length, 0);
  app.close();
});

test('servidor de sinalização caiu: o celular reconecta', async () => {
  const app = await abrir();
  app.peer.state.instance.disconnected = true;

  app.peer.emitPeer('disconnected');
  await app.clock.advance(3000);

  assert.equal(app.peer.state.reconnects, 1);
  app.close();
});

test('PIN em uso não pinta o selo de erro (só troca o PIN)', async () => {
  const app = await abrir();
  app.peer.emitPeer('error', { type: 'unavailable-id' });
  assert.notEqual(status(app), 'erro de conexão');
  app.close();
});

test('estados passageiros do WebRTC não derrubam o painel', async () => {
  const app = await abrir();
  const viva = app.novaConexao();
  viva.conn.emit('open');
  for (const estado of ['connecting', 'disconnected', 'connected']) viva.conn.peerConnection.mudar(estado);
  assert.equal(status(app), 'viewer conectado');
  assert.equal(viva.conn.closed, false);
  app.close();
});

test('servidor volta: o aviso de erro some, mesmo com o selo em maiúsculas', async () => {
  const app = await abrir();
  // no navegador o innerText respeita o text-transform: uppercase do selo
  const el = app.document.getElementById('status');
  Object.defineProperty(el, 'innerText', {
    configurable: true,
    get: () => el.textContent.toUpperCase(),
    set: (v) => { el.textContent = v; },
  });
  app.peer.emitPeer('error', { type: 'network' });

  app.peer.emitPeer('open');

  assert.equal(el.textContent, 'conexão restabelecida');
  assert.equal(el.parentElement.dataset.tipo, 'ok');
  app.close();
});
