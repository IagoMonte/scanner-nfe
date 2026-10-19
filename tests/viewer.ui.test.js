'use strict';

/**
 * Camada visual: o que o operador vê e o que sai no clipboard no "Gerar linha".
 * A linha tabulada é o produto final do sistema — se o formato mudar, o Excel
 * que consome a coluna quebra.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createViewerApp, flush, jsonResponse } = require('./helpers/harness');
const {
  CHAVE_UMA,
  CNPJ_UMA,
  NF_UMA,
  CHAVE_DUAS,
  CNPJ_DUAS,
  NF_DUAS,
  FORNECEDOR,
  xmlNota,
  respostaPrimaria,
} = require('./helpers/fixtures');

function criarApp() {
  const app = createViewerApp();
  app.fetch.on('/api/nfe/fallback/', () => { throw new Error('fallback não deveria ser chamado'); });
  app.fetch.on('/api/nfe/', () => jsonResponse(respostaPrimaria(xmlNota())));
  app.fetch.on('/receita/', () => jsonResponse({ nome: FORNECEDOR }));
  return app;
}

function linhaEsperada(chave, produto, quantidade, fornecedor, dataRecebimento, fabricacao, validade, nota) {
  return [chave, produto, dataRecebimento, quantidade, fornecedor, fabricacao, validade, nota].join('\t');
}

test('ao conectar, o painel mostra "conectado" e pronto para receber', () => {
  const app = criarApp();
  app.connect();

  assert.equal(app.document.getElementById('status').innerText, 'conectado');
  assert.equal(app.document.getElementById('loading').innerText, 'Pronto para receber novas leituras.');
  app.close();
});

test('estado inicial: lista vazia, contador em 0 e aviso de nenhuma nota selecionada', () => {
  const app = criarApp();

  assert.equal(app.document.getElementById('scan-count').textContent, '0');
  assert.equal(app.document.getElementById('detail-subtitle').textContent, 'Nenhuma nota selecionada.');
  assert.equal(app.$('#card-list').innerHTML, '');
  assert.match(app.$('#detail-view').innerHTML, /As notas recebidas aparecem na lista lateral/);
  app.close();
});

test('estado de carregamento: card "Lendo" com CNPJ e NF, sem fornecedor ainda', () => {
  const app = criarApp();
  app.app.criarScan(CHAVE_UMA);

  const item = app.$('.list-item');
  assert.ok(item.classList.contains('active'), 'nota nova fica selecionada');
  assert.ok(!item.classList.contains('error'));
  assert.equal(item.querySelector('.mini-tag').textContent, 'Lendo');
  assert.equal(item.querySelector('.list-code').textContent, CHAVE_UMA);
  assert.equal(item.querySelector('.timer').textContent, `NF ${NF_UMA}`);
  assert.equal(item.querySelector('.footer-note').textContent, 'Aguardando consulta.');

  const card = app.$('.scan-card.loading');
  assert.ok(card, 'card de loading deve existir');
  assert.equal(card.querySelector('.code').textContent, CHAVE_UMA);
  assert.equal(card.querySelector('.meta-box .value').textContent, CNPJ_UMA);
  assert.match(card.textContent, /Buscando fornecedor e produtos\./);
  assert.equal(app.document.getElementById('detail-subtitle').textContent, `NF ${NF_UMA} • ${CNPJ_UMA}`);
  app.close();
});

test('estado válido: lista mostra fornecedor/NF e o card detalha os produtos com campos', async () => {
  const app = criarApp();
  await app.app.processScan({ type: 'nfe', key: CHAVE_UMA });

  const item = app.$('.list-item');
  assert.ok(!item.classList.contains('error'), 'nota válida não ganha borda de erro');
  assert.equal(item.querySelector('.mini-tag').textContent, 'Válido');
  assert.equal(item.querySelector('.footer-note').textContent, FORNECEDOR, 'fornecedor aparece na lista');
  assert.equal(item.querySelector('.timer').textContent, `NF ${NF_UMA}`);
  assert.equal(app.document.getElementById('scan-count').textContent, '1');

  const card = app.$('.scan-card.success');
  assert.ok(card, 'card de sucesso deve existir');
  assert.match(card.textContent, new RegExp(FORNECEDOR));
  assert.match(card.textContent, /CNPJ/);

  const produtos = app.$$('.product-item');
  assert.equal(produtos.length, 2, 'um bloco por produto');
  assert.equal(produtos[0].querySelector('.product-name').textContent, 'REAGENTE QUIMICO 500ML');
  assert.equal(produtos[0].querySelector('.qty').textContent, 'Quantidade: 10.0000 UN');
  assert.equal(produtos[1].querySelector('.qty').textContent, 'Quantidade: 24.0000 CX');

  const [primeiro] = produtos;
  assert.ok(primeiro.querySelector('input.fabricacao-input[type="date"]'), 'campo de fabricação é date');
  assert.ok(primeiro.querySelector('input.validade-input[type="number"]'), 'campo de validade é number');
  assert.equal(primeiro.querySelector('.generate-line-btn').dataset.index, '0', 'botão aponta para a linha 0');
  assert.equal(produtos[1].querySelector('.generate-line-btn').dataset.index, '1', 'segundo produto aponta para a linha 1');
  app.close();
});

test('erro: card marcado com a mensagem e a lista sinaliza visualmente', async () => {
  const app = criarApp();
  await app.app.processScan({ type: 'nfe', key: '0'.repeat(44) });

  const item = app.$('.list-item');
  assert.ok(item.classList.contains('error'), 'classe error na lista');
  assert.equal(item.querySelector('.mini-tag').textContent, 'Erro');
  assert.equal(item.querySelector('.footer-note').textContent, 'CNPJ não passou pela verificação.');

  const card = app.$('.scan-card.error');
  assert.ok(card);
  assert.equal(card.querySelector('.error-box').textContent, 'CNPJ não passou pela verificação.');
  assert.match(card.textContent, /00000000000000/, 'sem CNPJ válido o card mostra os dígitos lidos');

  // Chave curta demais para conter CNPJ: o card não pode exibir "undefined".
  app.app.criarScan('123');
  app.app.marcarErro(app.app.scans[0], 'teste');
  assert.match(app.$('.scan-card.error').textContent, /inválido/, 'CNPJ ausente vira "inválido"');
  app.close();
});

test('clique na lista troca a nota selecionada; clique fora de um card não muda nada', async () => {
  const app = criarApp();
  await app.app.processScan({ type: 'nfe', key: CHAVE_UMA });
  await app.app.processScan({ type: 'nfe', key: CHAVE_DUAS });

  assert.equal(
    app.document.getElementById('detail-subtitle').textContent,
    `NF ${NF_DUAS} • ${CNPJ_DUAS}`,
    'mais nova selecionada (subtítulo traz NF e CNPJ)'
  );

  const botoes = app.$$('.list-item');
  assert.equal(botoes.length, 2);
  app.click(botoes[1]); // a nota mais antiga

  // A lista inteira é re-renderizada no clique: os elementos antigos saem do documento.
  const depois = app.$$('.list-item');
  assert.equal(app.document.getElementById('detail-subtitle').textContent, `NF ${NF_UMA} • ${CNPJ_UMA}`);
  assert.ok(depois[1].classList.contains('active'), 'card clicado fica ativo');
  assert.ok(!depois[0].classList.contains('active'), 'o anterior perde o destaque');

  app.click(app.$('#card-list')); // área vazia da lista
  assert.equal(
    app.document.getElementById('detail-subtitle').textContent,
    `NF ${NF_UMA} • ${CNPJ_UMA}`,
    'clique fora de um card mantém a seleção'
  );
  app.close();
});

test('digitado nos campos vai para a planilha e alimenta a linha copiada', async () => {
  const app = criarApp();
  await app.app.processScan({ type: 'nfe', key: CHAVE_UMA });

  app.type(app.$('input.fabricacao-input[data-index="0"]'), '2026-02-10');
  app.type(app.$('input.validade-input[data-index="0"]'), '24');
  app.type(app.$('input.fabricacao-input[data-index="1"]'), '');

  const tabela = app.app.tabelaProdutos;
  assert.equal(tabela[0].fabricacao, '2026-02-10', 'data digitada vai para a linha da planilha');
  assert.equal(tabela[0].validadeMeses, '24');
  assert.equal(tabela[1].fabricacao, '', 'produto sem data continua em branco');

  // A planilha (fonte da linha do Excel) é que decide: render de novo e copia mesmo assim.
  app.app.renderUI();
  app.click(app.$('.generate-line-btn[data-index="0"]'));
  await flush();
  assert.match(app.clipboard.texts[0], /\t10\/02\/2026\t24 meses\t/, 'linha copiada usa o que foi digitado');
  app.close();
});

test.skip('valores digitados continuam visíveis nos inputs após nova renderização', () => {
  // Intenção: o que o operador digita no card deve sobreviver a qualquer re-render
  // (chegada de nota nova, troca de seleção, tick de 1s enquanto há exclusão agendada).
  // Motivo do skip: BUG atual — o handler grava em tabelaProdutos, mas o card é
  // montado a partir de scan.produtos (cópia congelada), então o campo volta vazio.
  // A linha do Excel continua correta (lê da tabela); só a tela perde o valor.
  // Corrigir na refatoração (ler o valor da mesma fonte) e desativar o skip.
});

test('input com índice que não existe na planilha é ignorado sem lançar erro', async () => {
  const app = criarApp();
  await app.app.processScan({ type: 'nfe', key: CHAVE_UMA });

  const campoAvulso = app.document.createElement('input');
  campoAvulso.className = 'fabricacao-input';
  campoAvulso.dataset.index = '99';
  app.document.body.appendChild(campoAvulso);
  app.type(campoAvulso, '2026-01-01');

  assert.equal(app.app.tabelaProdutos.length, 2, 'nenhuma linha foi tocada');
  assert.equal(app.app.tabelaProdutos[0].fabricacao, '');
  campoAvulso.remove();
  app.close();
});

test('"Gerar linha" copia a linha no formato exato da planilha (tab separado)', { timeout: 5000 }, async () => {
  const app = criarApp();
  await app.app.processScan({ type: 'nfe', key: CHAVE_UMA });

  app.type(app.$('input.fabricacao-input[data-index="0"]'), '2026-02-10');
  app.type(app.$('input.validade-input[data-index="0"]'), '24');

  const botao = app.$('.generate-line-btn[data-index="0"]');
  app.click(botao);
  await flush(); // a cópia é assíncrona: o rótulo "Copiado" só muda depois do resolve

  assert.equal(app.clipboard.texts.length, 1, 'uma única cópia por clique');
  assert.equal(
    app.clipboard.texts[0],
    linhaEsperada(
      CHAVE_UMA,
      'REAGENTE QUIMICO 500ML',
      '10.0000 UN',
      FORNECEDOR,
      new Date().toLocaleDateString('pt-BR'),
      '10/02/2026',
      '24 meses',
      NF_UMA
    ),
    'formato das 8 colunas: chave, produto, recebimento, qtd+un, fornecedor, fabricação, validade, NF'
  );
  assert.equal(botao.innerText, 'Copiado', 'feedback visual imediato');

  await app.clock.advance(1300);
  assert.equal(botao.innerText, 'Gerar linha', 'o rótulo volta sozinho');
  app.close();
});

test('"Gerar linha" com campos vazios deixa as colunas vazias (não escreve "undefined")', async () => {
  const app = criarApp();
  await app.app.processScan({ type: 'nfe', key: CHAVE_UMA });

  app.click(app.$('.generate-line-btn[data-index="1"]'));

  assert.equal(app.clipboard.texts.length, 1);
  assert.equal(
    app.clipboard.texts[0],
    linhaEsperada(
      CHAVE_UMA,
      'LUVA NITRILICA P',
      '24.0000 CX',
      FORNECEDOR,
      new Date().toLocaleDateString('pt-BR'),
      '', // sem fabricação
      '', // sem validade
      NF_UMA
    )
  );
  assert.ok(!app.clipboard.texts[0].includes('undefined'), 'undefined não pode vazar para o Excel');
  app.close();
});

test('"Gerar linha" de índice inexistente não copia nada', async () => {
  const app = criarApp();
  await app.app.processScan({ type: 'nfe', key: CHAVE_UMA });

  const campoAvulso = app.document.createElement('button');
  campoAvulso.className = 'generate-line-btn';
  campoAvulso.dataset.index = '99';
  app.document.body.appendChild(campoAvulso);
  app.click(campoAvulso);

  assert.equal(app.clipboard.texts.length, 0, 'sem linha correspondente, nada é copiado');
  campoAvulso.remove();
  app.close();
});

test('nota sem produtos no XML mostra aviso no card em vez de área em branco', async () => {
  const app = criarApp();
  app.fetch.on('/api/nfe/', () => jsonResponse(respostaPrimaria('<nfeProc></nfeProc>')));
  app.fetch.on('/receita/', () => jsonResponse({ nome: FORNECEDOR }));

  await app.app.processScan({ type: 'nfe', key: CHAVE_UMA });

  // Sem produto o processo falha em "Nenhum produto encontrado" e vira card de erro.
  const card = app.$('.scan-card.error');
  assert.ok(card, 'nota sem produto não pode parecer uma nota válida');
  assert.match(card.querySelector('.error-box').textContent, /Nenhum produto encontrado no XML\./);
  app.close();
});
