'use strict';

/**
 * Regras puras do viewer: validação de CNPJ, limpeza de texto de XML, formatação
 * de data, rótulos de status e a leitura do layout da chave de acesso.
 * São estas regras que decidem se uma nota é aceita ou rejeitada.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createViewerApp } = require('./helpers/harness');
const {
  CHAVE_UMA,
  CNPJ_UMA,
  NF_UMA,
  CHAVE_DUAS,
} = require('./helpers/fixtures');

function novaApp() {
  const app = createViewerApp();
  return app;
}

test('validarCNPJ aceita um CNPJ real e a mesma coisa com pontuação', () => {
  const { app } = novaApp();
  assert.equal(app.validarCNPJ(CNPJ_UMA), true, 'CNPJ da chave do README deve ser válido');
  assert.equal(app.validarCNPJ('03.157.268/0002-00'), true, 'formatação deve ser ignorada');
});

test('validarCNPJ rejeita dígito verificador adulterado', () => {
  const { app } = novaApp();
  // Último dígito do CNPJ real trocado: se a refac "aceitar qualquer coisa", isto passa a dar true.
  assert.equal(app.validarCNPJ('03157268000201'), false);
  // Dígito do meio trocado (mesmo comprimento).
  assert.equal(app.validarCNPJ('13157268000200'), false);
});

test('validarCNPJ rejeita lixo: CNPJ curto/longo, vazio e 14 dígitos iguais', () => {
  const { app } = novaApp();
  assert.equal(app.validarCNPJ('123'), false, '3 dígitos não são CNPJ');
  assert.equal(app.validarCNPJ(`${CNPJ_UMA}5`), false, '15 dígitos não são CNPJ');
  assert.equal(app.validarCNPJ(''), false);
  assert.equal(app.validarCNPJ(undefined), false);
  assert.equal(app.validarCNPJ('11111111111111'), false, 'dígitos repetidos são atalho inválido');
});

test('limparXML remove CDATA, decodifica entidades e normaliza espaços', () => {
  const { app } = novaApp();
  assert.equal(app.limparXML('<![CDATA[PRODUTO (B)]]>'), 'PRODUTO (B)');
  assert.equal(
    app.limparXML('A &amp; B &lt;C&gt; &quot;D&quot; &#39;E&#39;'),
    `A & B <C> "D" 'E'`,
    'entidades do XML precisam virar texto legível na tela'
  );
  assert.equal(
    app.limparXML('  linha1\n\n  linha2\t fim  '),
    'linha1 linha2 fim',
    'espaços quebrados viram um espaço só para não estourar o card'
  );
  assert.equal(app.limparXML(), '', 'sem valor não pode lançar erro');
});

test('formatarData converte ISO para dd/mm/aaaa e devolve vazio quando não há data', () => {
  const { app } = novaApp();
  assert.equal(app.formatarData('2026-02-10T00:00:00'), '10/02/2026');
  assert.equal(app.formatarData('2026-12-31'), '31/12/2026');
  assert.equal(app.formatarData(''), '', 'fabricação em branco não pode virar "undefined/undefined/undefined"');
  assert.equal(app.formatarData(null), '');
  assert.equal(app.formatarData(undefined), '');
});

test('rótulos de status: success/error/loading viram as tags Válido/Erro/Lendo', () => {
  const { app } = novaApp();
  assert.equal(app.getStatusClass('success'), 'ok');
  assert.equal(app.getStatusLabel('success'), 'Válido');
  assert.equal(app.getStatusClass('error'), 'err');
  assert.equal(app.getStatusLabel('error'), 'Erro');
  // loading e qualquer valor desconhecido caem em "Lendo" (estado de espera).
  assert.equal(app.getStatusClass('loading'), 'wait');
  assert.equal(app.getStatusLabel('loading'), 'Lendo');
  assert.equal(app.getStatusLabel('qualquer-coisa'), 'Lendo');
});

test('criarScan lê CNPJ e número da NF nas posições certas da chave', () => {
  const { app } = novaApp();
  const scan = app.criarScan(CHAVE_UMA);

  assert.equal(scan.key, CHAVE_UMA);
  assert.equal(scan.cnpj, CNPJ_UMA, 'CNPJ ocupa os dígitos 6..19 da chave');
  assert.equal(scan.notaFiscal, NF_UMA, 'nNF (25..33) perde zeros à esquerda');
  assert.equal(scan.fornecedor, '');
  assert.equal(scan.produtos.length, 0);
  assert.equal(app.validarCNPJ(scan.cnpj), true, 'a chave de exemplo deve passar na validação');
});

test('criarScan: nNF só de zeros vira vazio e a nota nasce em carregamento, sem auto-exclusão', () => {
  const { app } = novaApp();
  const scan = app.criarScan('0'.repeat(44));
  assert.equal(scan.notaFiscal, '', 'nNF zerada não pode virar "000000000" na tela');
  assert.equal(scan.status, 'loading');
  assert.equal(scan.deleteAt, null, 'auto-exclusão só é marcada em erro');
  assert.equal(scan.deleteTimer, null);
});

test('criarScan empilha a nota mais nova em cima e a seleciona', () => {
  const { app } = novaApp();
  const primeira = app.criarScan(CHAVE_UMA);
  const segunda = app.criarScan(CHAVE_DUAS);

  assert.equal(app.scans.length, 2);
  assert.equal(app.scans[0].id, segunda.id, 'lista é do mais novo para o mais antigo');
  assert.equal(app.selectedScanId, segunda.id, 'nota recém-criada fica selecionada');
  assert.notEqual(primeira.id, segunda.id, 'ids precisam ser únicos');
  assert.match(primeira.id, /^scan-/);
});
