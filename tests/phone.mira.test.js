'use strict';

/**
 * A área verde é a promessa do que o OCR lê. Se ela for maior que o recorte, o
 * operador enquadra a chave "dentro do verde" e a leitura falha sem explicação.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createPhoneApp, flush } = require('./helpers/harness');

const definir = (elemento, medidas) => Object.entries(medidas)
  .forEach(([nome, value]) => Object.defineProperty(elemento, nome, { value, configurable: true }));

function medir(app, { video: [videoWidth, videoHeight], tela: [clientWidth, clientHeight] }) {
  const video = app.document.getElementById('video');
  definir(video, { videoWidth, videoHeight, clientWidth, clientHeight });
  video.dispatchEvent(new app.window.Event('loadedmetadata'));
  app.phone.captureFrame();
  const [, , , sw, sh] = app.canvasState.drawCalls.at(-1);
  // object-fit: cover → o vídeo é ampliado pela maior das duas razões
  const escala = Math.max(clientWidth / videoWidth, clientHeight / videoHeight);
  const alvo = app.document.getElementById('alvo');
  return { largura: parseFloat(alvo.style.width), altura: parseFloat(alvo.style.height), sw: sw * escala, sh: sh * escala };
}

const CENARIOS = {
  'paisagem 1080p': { video: [1920, 1080], tela: [360, 202.5] },
  'retrato com altura cortada': { video: [1080, 1920], tela: [360, 230] },
  'caixa mais alta que o vídeo (corta as laterais)': { video: [1920, 1080], tela: [200, 140] },
};

for (const [nome, cenario] of Object.entries(CENARIOS)) {
  test(`área verde = recorte do OCR: ${nome}`, async () => {
    const app = createPhoneApp();
    await flush();
    const m = medir(app, cenario);
    assert.ok(Math.abs(m.largura - m.sw) < 0.5, `largura ${m.largura} != recorte ${m.sw}`);
    assert.ok(Math.abs(m.altura - m.sh) < 0.5, `altura ${m.altura} != recorte ${m.sh}`);
    app.close();
  });
}

test('girar o aparelho recalcula a área verde', async () => {
  const app = createPhoneApp();
  await flush();
  medir(app, CENARIOS['paisagem 1080p']);
  definir(app.document.getElementById('video'), { clientWidth: 720, clientHeight: 405 });

  app.window.dispatchEvent(new app.window.Event('resize'));

  const altura = parseFloat(app.document.getElementById('alvo').style.height);
  assert.ok(Math.abs(altura - 90 * (720 / 1920)) < 0.5, `altura não recalculada: ${altura}`);
  app.close();
});

test('câmera muda de proporção (evento do vídeo) e a área verde acompanha', async () => {
  const app = createPhoneApp();
  await flush();
  medir(app, CENARIOS['paisagem 1080p']);
  const video = app.document.getElementById('video');
  definir(video, { videoWidth: 640, videoHeight: 480, clientWidth: 360, clientHeight: 270 });

  video.dispatchEvent(new app.window.Event('resize'));

  const altura = parseFloat(app.document.getElementById('alvo').style.height);
  assert.ok(Math.abs(altura - 90 * (360 / 640)) < 0.5, `altura não recalculada: ${altura}`);
  app.close();
});
