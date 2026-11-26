'use strict';

/**
 * Cor do status no celular: o operador olha de relance, com a nota na mão. O tom
 * do selo precisa dizer se pode capturar (ok), se deve esperar (wait) ou se algo
 * falhou (err) — um erro pintado de verde faz a leitura passar por boa.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createPhoneApp, flush } = require('./helpers/harness');
const { CHAVE_UMA } = require('./helpers/fixtures');

const tom = (app) => app.document.getElementById('status').parentElement.dataset.tipo;

test('câmera: iniciando é espera, pronta é ok, falha é erro', async () => {
  const app = createPhoneApp();
  await flush();
  assert.equal(tom(app), 'ok');

  app.camera.getUserMedia = async () => { throw new Error('permissão negada'); };
  await app.phone.startCamera();
  assert.equal(tom(app), 'err');
  app.close();

  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'phone.html'), 'utf8');
  assert.match(html, /data-tipo="wait"[\s\S]*?iniciando câmera/, 'antes da câmera abrir o selo é de espera');
});

test('leitura boa fica ok; leitura incompleta e falha do OCR ficam em erro', async () => {
  const app = createPhoneApp();
  await flush();
  app.connectViewer();

  app.ocr.text = '3526 0503';
  await app.phone.processOCR();
  assert.equal(tom(app), 'err', 'faltando dígitos não pode parecer sucesso');

  app.ocr.text = CHAVE_UMA;
  await app.phone.processOCR();
  assert.equal(tom(app), 'ok');

  app.window.Tesseract.recognize = async () => { throw new Error('falhou'); };
  await app.phone.processOCR();
  assert.equal(tom(app), 'err');
  app.close();
});

test('enquanto o OCR roda o selo é de espera', async () => {
  const app = createPhoneApp();
  await flush();
  app.connectViewer();

  let durante;
  app.window.Tesseract.recognize = async () => { durante = tom(app); return { data: { text: CHAVE_UMA } }; };
  await app.phone.processOCR();

  assert.equal(durante, 'wait');
  app.close();
});
