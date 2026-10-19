'use strict';

/**
 * App do celular: abrir a câmera, recortar a faixa da chave e transformar o texto
 * do OCR em uma chave de 44 dígitos enviada ao painel. É aqui que a leitura nasce —
 * se a extração falhar, nada do outro lado acontece.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createPhoneApp, flush } = require('./helpers/harness');
const { CHAVE_UMA } = require('./helpers/fixtures');

/** Texto sujo como o Tesseract devolve (espaços, quebras e rótulos). */
function ocrComRuido(chave = CHAVE_UMA) {
  return `NF-e\n${chave.slice(0, 4)} ${chave.slice(4, 8)} ${chave.slice(8, 12)} ${chave.slice(12, 20)}`
    + ` ${chave.slice(20, 32)} ${chave.slice(32, 44)}\n`;
}

function abrirApp() {
  const app = createPhoneApp();
  app.sent = app.connectViewer();
  return app;
}

test('abrir a página liga a câmera traseira em Full HD e avisa "câmera pronta"', async () => {
  const app = createPhoneApp();
  await flush(); // startCamera() roda no carregamento do script

  assert.equal(app.camera.calls.length, 1, 'a câmera inicia sozinha ao abrir a página');
  const [restricoes] = app.camera.calls;
  assert.equal(restricoes.video.facingMode.ideal, 'environment', 'traseira é a câmera do recebimento');
  assert.equal(restricoes.video.width.ideal, 1920);
  assert.equal(restricoes.video.height.ideal, 1080);
  assert.equal(restricoes.audio, false, 'não precisa de áudio');
  assert.equal(app.document.getElementById('status').innerText, 'câmera pronta');
  app.close();
});

test('falha da câmera vira status de erro em vez de travar a página', async () => {
  const app = createPhoneApp();
  app.camera.getUserMedia = async () => { throw new Error('permissão negada'); };

  await app.phone.startCamera();
  assert.equal(app.document.getElementById('status').innerText, 'erro câmera');
  app.close();
});

test('conexão do painel é sinalizada na tela do celular', async () => {
  const app = createPhoneApp();
  await flush();

  app.connectViewer();
  assert.equal(app.document.getElementById('status').innerText, 'viewer conectado');
  assert.equal(app.phone.conn !== null, true, 'a conexão fica guardada para envio');
  app.close();
});

test('sem painel conectado, tentar ler avisa e não chama o OCR', async () => {
  const app = createPhoneApp();

  await app.phone.processOCR();

  assert.deepEqual(app.alerts, ['viewer não conectado'], 'operador precisa saber que nada foi enviado');
  assert.equal(app.ocr.calls.length, 0, 'OCR caro nem começa sem para quem enviar');
  app.close();
});

test('OCR com ruído extrai a chave de 44 dígitos e envia para o painel', async () => {
  const app = abrirApp();
  app.ocr.text = ocrComRuido();

  app.document.getElementById('captureBtn').click();
  await flush();

  assert.equal(app.ocr.calls.length, 1, 'o botão CAPTURAR CHAVE dispara o OCR');
  const [chamada] = app.ocr.calls;
  assert.equal(chamada.language, 'eng');
  assert.equal(
    chamada.options.tessedit_char_whitelist,
    '0123456789',
    'whitelist numérica: a chave só tem dígitos'
  );

  assert.equal(app.sent.length, 1, 'uma única mensagem enviada');
  const payload = app.sent[0];
  assert.equal(payload.type, 'nfe', 'o painel só trata mensagens type:"nfe"');
  assert.equal(payload.key, CHAVE_UMA, 'chave limpa, sem espaços/quebras');
  assert.match(payload.key, /^\d{44}$/);
  assert.ok(payload.image.startsWith('data:image/'), 'manda a imagem junto para conferência');

  assert.equal(app.document.getElementById('last-key').innerText, CHAVE_UMA);
  assert.equal(app.document.getElementById('status').innerText, 'chave enviada');
  assert.deepEqual(app.vibes, [300], 'vibração longa = leitura boa');
  app.close();
});

test('imagem recortada é a faixa central da tela (área verde do overlay)', async () => {
  const app = abrirApp();
  app.ocr.text = ocrComRuido();

  await app.phone.captureFrame();

  assert.equal(app.canvasState.drawCalls.length, 1);
  const [, sx, sy, sw, sh] = app.canvasState.drawCalls[0];

  assert.ok(Math.abs(sw - 1920 * 0.92) < 0.001, 'largura = 92% do quadro (largura da área verde)');
  assert.ok(Math.abs(sh - 90) < 0.001, 'altura = 90px (altura da área verde)');
  assert.ok(Math.abs(sx - (1920 - 1920 * 0.92) / 2) < 0.001, 'recorte centrado na horizontal');
  assert.ok(Math.abs(sy - (1080 / 2 - 45)) < 0.001, 'recorte centrado na vertical');
  app.close();
});

test('texto com menos de 44 dígitos não é enviado e o status conta o que faltou', async () => {
  const app = abrirApp();
  app.ocr.text = '3526 0503 1572 6800'; // 16 dígitos

  await app.phone.processOCR();

  assert.equal(app.sent.length, 0, 'chave incompleta nunca vai para o painel');
  assert.equal(app.document.getElementById('status').innerText, 'faltando dígitos (16/44)');
  assert.equal(app.document.getElementById('last-key').innerText, '3526050315726800');
  assert.deepEqual(app.vibes, [100], 'vibração curta = leitura ruim');
  app.close();
});

test('sem nenhum dígito o status diz 0/44 e a tela mostra que nada foi lido', async () => {
  const app = abrirApp();
  app.ocr.text = 'nada legível aqui';

  await app.phone.processOCR();

  assert.equal(app.sent.length, 0);
  assert.equal(app.document.getElementById('status').innerText, 'faltando dígitos (0/44)');
  assert.equal(app.document.getElementById('last-key').innerText, 'nenhum número encontrado');
  app.close();
});

test('mais de 44 dígitos: usa a primeira sequência completa de 44', async () => {
  const app = abrirApp();
  app.ocr.text = `${CHAVE_UMA} 99999`; // dígitos sobrando no fim

  await app.phone.processOCR();

  assert.equal(app.sent.length, 1);
  assert.equal(app.sent[0].key, CHAVE_UMA);
  app.close();
});

test.skip('dígito solto antes da chave não desloca a leitura da chave inteira', () => {
  // Intenção: OCR que devolve "NF12345 3526...9656" deve encontrar a chave de 44
  // dígitos, não uma janela de 44 começando no ruído.
  // Motivo do skip: comportamento atual pega os PRIMEIROS 44 dígitos do texto limpo
  // (text.match(/\d{44}/) após strip), então um dígito de ruído no início troca a chave.
  // Corrigir na refatoração (ex.: validar DV da chave / procurar janela válida) e
  // desativar o skip.
});
