'use strict';

/**
 * Um celular atende um painel por vez. Sem isso, quem acertasse o PIN depois
 * passaria a receber as leituras no lugar do operador, sem ninguém perceber.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createPhoneApp, flush } = require('./helpers/harness');
const { CHAVE_UMA } = require('./helpers/fixtures');

const status = (app) => app.document.getElementById('status').innerText;

test('segunda conexão é fechada e a leitura continua indo para o primeiro painel', async () => {
  const app = createPhoneApp();
  await flush();
  const primeiro = app.novaConexao();
  primeiro.conn.emit('open');
  const intruso = app.novaConexao();
  intruso.conn.emit('open');

  app.ocr.text = CHAVE_UMA;
  await app.phone.processOCR();

  assert.equal(intruso.conn.closed, true);
  assert.equal(intruso.sent.length, 0, 'o intruso não recebe chave nem imagem');
  assert.equal(primeiro.sent.length, 1);
  assert.equal(primeiro.conn.closed, false);
  app.close();
});

test('painel desconectou: o celular avisa, não finge envio e aceita o próximo', async () => {
  const app = createPhoneApp();
  await flush();
  const primeiro = app.novaConexao();
  primeiro.conn.emit('open');

  primeiro.conn.close();
  assert.equal(status(app), 'viewer desconectado');
  await app.phone.processOCR();
  assert.deepEqual(app.alerts, ['viewer não conectado']);

  const segundo = app.novaConexao();
  segundo.conn.emit('open');
  assert.equal(segundo.conn.closed, false);
  assert.equal(status(app), 'viewer conectado');
  app.close();
});

test('câmera abrindo depois não apaga o aviso de painel conectado', async () => {
  const app = createPhoneApp();
  await flush();
  app.connectViewer();

  await app.phone.startCamera();

  assert.equal(status(app), 'viewer conectado');
  app.close();
});

test('erro do servidor de conexão não deixa o selo verde', async () => {
  const app = createPhoneApp();
  await flush();

  app.peer.emitPeer('error', { type: 'network' });

  assert.equal(status(app), 'erro de conexão');
  assert.equal(app.document.getElementById('status').parentElement.dataset.tipo, 'err');
  app.close();
});
