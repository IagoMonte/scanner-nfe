'use strict';

/**
 * PIN do celular: o celular gera um PIN numérico de 6 dígitos e esse número É o
 * PeerID da sessão. Quem souber o PIN conecta; quem não souber, não chega perto.
 * Se o PIN colidir com outro peer no servidor, um novo é gerado e a tela atualiza.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createPhoneApp, flush } = require('./helpers/harness');

test('celular gera um PIN de 6 dígitos que é o PeerID e o exibe na tela', async () => {
  const app = createPhoneApp();
  await flush(); // startCamera() roda no carregamento

  const pin = app.peer.state.peerIds[0];
  assert.match(pin, /^\d{6}$/, 'PIN numérico de 6 dígitos — é ele que o viewer digita');
  assert.equal(
    app.document.getElementById('pin').innerText,
    pin,
    'a tela mostra EXATAMENTE o número que virou o PeerID (senão ninguém conecta)'
  );
  assert.equal(app.peer.state.created, 1, 'um único peer até aqui');
  app.close();
});

test('dois celulares geram PINs independentes (o peer de um não é o do outro)', async () => {
  const appA = createPhoneApp();
  const appB = createPhoneApp();
  await flush();

  const [pinA, pinB] = [appA.peer.state.peerIds[0], appB.peer.state.peerIds[0]];
  assert.notEqual(pinA, pinB, 'PINs diferentes: conexões não se confundem');
  appA.close();
  appB.close();
});

test('PIN em uso no servidor (unavailable-id): regenera, atualiza a tela e volta a aceitar', async () => {
  const app = createPhoneApp();
  await flush();

  const pinQueColidiu = app.peer.state.peerIds[0];
  app.peer.emitPeer('error', { type: 'unavailable-id' });
  await flush();

  assert.equal(app.peer.state.created, 2, 'um NOVO peer é criado em vez de morrer silenciosamente');
  const pinNovo = app.peer.state.peerIds[1];
  assert.match(pinNovo, /^\d{6}$/);
  assert.notEqual(pinQueColidiu, pinNovo, 'o novo PIN não é o que estava em uso');
  assert.equal(
    app.document.getElementById('pin').innerText,
    pinNovo,
    'a tela mostra o PIN atual (viewer precisa ver o número certo)'
  );

  // Depois da regeneração, a conexão do viewer continua entrando.
  app.connectViewer();
  assert.equal(app.document.getElementById('status').innerText, 'viewer conectado');
  app.close();
});
