'use strict';

/**
 * O painel exibe texto escrito por terceiros: quem emite a nota (xProd), a consulta
 * de CNPJ e o que chega pelo canal P2P. Nada disso pode virar HTML — viraria
 * script rodando na origem do painel, com acesso ao proxy que leva a API key.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createViewerApp, jsonResponse, flush } = require('./helpers/harness');
const { CHAVE_UMA, xmlNota, respostaPrimaria } = require('./helpers/fixtures');

const MALICIOSO = '<img src=x onerror="window.__invadido=1">';
/** Como o texto chega no XML: escapado duas vezes, para sobreviver ao parser. */
const NO_XML = MALICIOSO.replace(/</g, '&amp;lt;').replace(/>/g, '&amp;gt;');

test('produto e fornecedor com HTML aparecem como texto, nunca como elemento', async () => {
  const app = createViewerApp();
  app.fetch.on('/receita/', () => jsonResponse({ nome: MALICIOSO }));
  app.fetch.on('/api/nfe/', () => jsonResponse(respostaPrimaria(
    xmlNota([{ nome: NO_XML, quantidade: '1.0000', unidade: 'UN' }]),
  )));
  app.connect();

  await app.sendKey(CHAVE_UMA);
  await flush();

  assert.equal(app.$$('img').length, 0, 'nenhum elemento criado a partir de dado externo');
  assert.equal(app.$('.product-name').textContent, MALICIOSO, 'o texto continua legível para conferência');
  assert.ok(app.$('#card-list').textContent.includes(MALICIOSO), 'fornecedor literal na lista');
  app.close();
});

test('mensagem de erro com HTML (vinda da consulta) também é texto', async () => {
  const app = createViewerApp();
  app.fetch.on('/receita/', () => { throw new Error(MALICIOSO); });
  app.fetch.on('/api/nfe/', () => jsonResponse(respostaPrimaria(xmlNota())));
  app.connect();

  await app.sendKey(CHAVE_UMA);
  await flush();

  assert.equal(app.$$('img').length, 0);
  assert.ok(app.$('#detail-view .error-box').textContent.includes(MALICIOSO));
  app.close();
});

test('mensagem do celular que não é uma chave de 44 dígitos é descartada', async () => {
  const app = createViewerApp();
  app.connect();

  for (const key of [MALICIOSO, '123', `${CHAVE_UMA}<b>`, 12345, undefined]) {
    await app.sendKey(key);
  }
  await app.receive(null);
  await app.clock.advance(10000);

  assert.equal(app.app.scans.length, 0, 'nenhum cartão para lixo vindo do canal');
  assert.equal(app.fetch.calls.length, 0, 'e nada é consultado pelo proxy');
  app.close();
});

test('celular fecha a conexão: o painel avisa e volta a pedir o PIN', () => {
  const app = createViewerApp();
  app.connect();
  assert.equal(app.$('#pin-modal').hidden, true);

  app.peer.emitConn('close');

  assert.equal(app.document.getElementById('status').innerText, 'desconectado', 'nunca seguir "conectado" sem canal');
  assert.equal(app.$('#pin-modal').hidden, false);
  assert.equal(app.$('#pin-error').hidden, false, 'o motivo aparece');
  app.close();
});

test('quantidade, unidade e mensagem da lista também são texto', async () => {
  const app = createViewerApp();
  app.fetch.on('/receita/', () => jsonResponse({ nome: 'A & B "C" \'D\' <E>' }));
  app.fetch.on('/api/nfe/', () => jsonResponse(respostaPrimaria(
    xmlNota([{ nome: 'P', quantidade: NO_XML, unidade: NO_XML }]),
  )));
  app.connect();

  await app.sendKey(CHAVE_UMA);
  await flush();

  assert.equal(app.$$('img').length, 0);
  assert.ok(app.$('.qty').textContent.includes(`${MALICIOSO} ${MALICIOSO}`));
  assert.ok(app.$('#card-list').textContent.includes('A & B "C" \'D\' <E>'), 'caracteres especiais intactos');
  app.close();
});

test('erro com HTML na lista lateral é texto', async () => {
  const app = createViewerApp();
  app.fetch.on('/receita/', () => { throw new Error(MALICIOSO); });
  app.fetch.on('/api/nfe/', () => jsonResponse(respostaPrimaria(xmlNota())));
  app.connect();
  await app.sendKey(CHAVE_UMA);
  await flush();
  assert.equal(app.$$('#card-list img').length, 0);
  app.close();
});

test('chave com lixo na frente ou em tipo errado também é descartada', async () => {
  const app = createViewerApp();
  app.connect();
  for (const key of [`x${CHAVE_UMA}`, `${CHAVE_UMA}0`, [CHAVE_UMA]]) {
    await app.sendKey(key);
    await app.clock.advance(1500);
  }
  assert.equal(app.app.scans.length, 0);
  app.close();
});
