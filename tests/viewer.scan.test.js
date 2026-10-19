'use strict';

/**
 * Ciclo de vida da nota: processar o payload vindo do celular, montar a lista de
 * produtos + linhas da planilha, marcar erros e limpar estado.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createViewerApp, jsonResponse } = require('./helpers/harness');
const {
  CHAVE_UMA,
  CNPJ_UMA,
  NF_UMA,
  CHAVE_DUAS,
  NF_DUAS,
  CHAVE_CNPJ_INVALIDO,
  FORNECEDOR,
  xmlNota,
  respostaPrimaria,
} = require('./helpers/fixtures');

/**
 * Cenário feliz de rede: primária ok, receita ok e fallback proibido.
 * A rota do fallback vai antes porque o caminho contém "/api/nfe/".
 */
function criarApp({ primaria, receita } = {}) {
  const app = createViewerApp();
  app.fetch.on('/api/nfe/fallback/', () => { throw new Error('fallback não deveria ser chamado no cenário feliz'); });
  app.fetch.on('/api/nfe/', primaria || (() => jsonResponse(respostaPrimaria(xmlNota()))));
  app.fetch.on('/receita/', receita || (() => jsonResponse({ nome: FORNECEDOR })));
  return app;
}

test('processScan completa a nota: status success, fornecedor e produtos linkados à planilha', async () => {
  const app = criarApp();

  await app.app.processScan({ type: 'nfe', key: CHAVE_UMA });

  assert.equal(app.app.scans.length, 1);
  const scan = app.app.scans[0];
  assert.equal(scan.status, 'success');
  assert.equal(scan.fornecedor, FORNECEDOR);
  assert.equal(scan.cnpj, CNPJ_UMA);
  assert.equal(scan.notaFiscal, NF_UMA);
  assert.equal(scan.errorMessage, '');
  assert.equal(scan.deleteAt, null, 'nota válida não é auto-apagada');
  assert.equal(scan.produtos.length, 2);
  assert.equal(app.app.selectedScanId, scan.id);

  // indexTabela é o índice usado pelos inputs e pelo botão "Gerar linha".
  // (Array.from no realm do teste: arrays vindos do jsdom têm outro prototype)
  assert.deepEqual(
    Array.from(scan.produtos, (p) => p.indexTabela),
    [0, 1],
    'cada produto aponta para a sua linha na tabela global'
  );

  const tabela = app.app.tabelaProdutos;
  assert.equal(tabela.length, 2, 'uma linha por produto');
  assert.deepEqual(
    { ...tabela[0] },
    {
      produto: 'REAGENTE QUIMICO 500ML',
      dataRecebimento: new Date().toLocaleDateString('pt-BR'),
      quantidade: '10.0000',
      unidade: 'UN',
      fornecedor: FORNECEDOR,
      fabricacao: '',
      validadeMeses: '',
      notaFiscal: NF_UMA,
      key: CHAVE_UMA,
    },
    'a linha da planilha nasce completa, sem fabricação/validade'
  );
  assert.equal(tabela[1].key, CHAVE_UMA);
  assert.equal(tabela[1].notaFiscal, NF_UMA);
  app.close();
});

test('processScan descarta payload que não é NF-e e não consulta nada', async () => {
  const app = criarApp();

  await app.app.processScan(null);
  await app.app.processScan({ type: 'foto', key: CHAVE_UMA });
  await app.app.processScan(undefined);

  assert.equal(app.app.scans.length, 0, 'nenhum card deve nascer de payload estranho');
  assert.equal(app.fetch.calls.length, 0, 'nenhuma chamada de rede');
  app.close();
});

test('processScan não duplica a mesma chave mesmo recebendo o scan de novo', async () => {
  const app = criarApp();

  await app.app.processScan({ type: 'nfe', key: CHAVE_UMA });
  const chamadasAposPrimeira = app.fetch.calls.length;
  await app.app.processScan({ type: 'nfe', key: CHAVE_UMA });

  assert.equal(app.app.scans.length, 1, 'chave repetida não pode virar segundo card');
  assert.equal(app.fetch.calls.length, chamadasAposPrimeira, 'sem consulta repetida (proteção contra 429)');
  assert.equal(app.app.tabelaProdutos.length, 2, 'sem linhas duplicadas na planilha');
  app.close();
});

test('processScan mantém chave repetida bloqueada mesmo quando a primeira tentativa falhou', async () => {
  const app = criarApp({
    primaria: () => { throw new Error('sem rede'); },
    receita: () => jsonResponse({ nome: FORNECEDOR }),
  });

  await app.app.processScan({ type: 'nfe', key: CHAVE_UMA });
  assert.equal(app.app.scans[0].status, 'error');

  await app.app.processScan({ type: 'nfe', key: CHAVE_UMA });
  assert.equal(app.app.scans.length, 1, 'a chave já tratada continua bloqueada (comportamento atual)');
  app.close();
});

test('processScan rejeita chave com CNPJ inválido antes de chamar qualquer API', async () => {
  const app = criarApp();

  await app.app.processScan({ type: 'nfe', key: CHAVE_CNPJ_INVALIDO });

  assert.equal(app.fetch.calls.length, 0, 'não gasta consulta em chave inválida');
  const scan = app.app.scans[0];
  assert.equal(scan.status, 'error');
  assert.equal(scan.errorMessage, 'CNPJ não passou pela verificação.');
  assert.ok(scan.deleteAt, 'erro de leitura é auto-apagado depois de um tempo');
  assert.ok(scan.deleteTimer, 'timer de auto-exclusão deve estar agendado');
  app.close();
});

test('processScan marca erro quando a receita não devolve fornecedor, mas mantém o card', async () => {
  const app = criarApp({ receita: () => jsonResponse({ status: 'FAILED' }) });

  await app.app.processScan({ type: 'nfe', key: CHAVE_UMA });

  const scan = app.app.scans[0];
  assert.equal(scan.status, 'error');
  assert.equal(
    scan.errorMessage,
    'CNPJ válido, mas o fornecedor não foi retornado pela consulta.',
    'CNPF válido sem fornecedor é erro de dado: fica para conferência, não some sozinho'
  );
  assert.equal(scan.deleteAt, null, 'esse erro NÃO é auto-apagado');
  assert.equal(app.app.tabelaProdutos.length, 0, 'sem fornecedor não gera linha de planilha');
  app.close();
});

test('processScan vira erro auto-apagável quando a rede falha no XML ou na receita', async () => {
  const app = criarApp({ primaria: () => { throw new Error('timeout'); } });

  await app.app.processScan({ type: 'nfe', key: CHAVE_UMA });

  const scan = app.app.scans[0];
  assert.equal(scan.status, 'error');
  assert.match(
    scan.errorMessage,
    /^Falha ao consultar fornecedor ou XML da nota: /,
    'a mensagem precisa dizer qual etapa falhou'
  );
  assert.ok(scan.deleteAt, 'erro transitório some sozinho para não sujar a lista');
  app.close();
});

test('removerScan apaga junto as linhas da planilha daquela nota (sem órfãos)', async () => {
  const app = criarApp();

  await app.app.processScan({ type: 'nfe', key: CHAVE_UMA });
  await app.app.processScan({ type: 'nfe', key: CHAVE_DUAS });
  assert.equal(app.app.tabelaProdutos.length, 4, '2 produtos por nota');

  const scanRemovido = app.app.scans.find((s) => s.key === CHAVE_UMA);
  app.app.removerScan(scanRemovido.id);

  const tabela = app.app.tabelaProdutos;
  assert.equal(tabela.length, 2, 'sobram só as linhas da nota restante');
  assert.ok(
    tabela.every((linha) => linha.key === CHAVE_DUAS),
    'nenhuma linha órfã da nota apagada'
  );
  assert.equal(tabela[0].notaFiscal, NF_DUAS);
  app.close();
});

test('removerScan: seleção cai na próxima nota e, sem notas, fica nula', async () => {
  const app = criarApp();

  await app.app.processScan({ type: 'nfe', key: CHAVE_UMA });
  await app.app.processScan({ type: 'nfe', key: CHAVE_DUAS });
  const segunda = app.app.scans[0];
  assert.equal(app.app.selectedScanId, segunda.id);

  app.app.removerScan(segunda.id);
  assert.equal(app.app.selectedScanId, app.app.scans[0].id, 'seleção não pode ficar órfã');

  app.app.removerScan(app.app.scans[0].id);
  assert.equal(app.app.selectedScanId, null);
  assert.equal(app.app.scans.length, 0);
  assert.equal(app.app.tabelaProdutos.length, 0);
  app.close();
});

test('removerScan de id inexistente não quebra nem mexe no resto', async () => {
  const app = criarApp();
  await app.app.processScan({ type: 'nfe', key: CHAVE_UMA });

  app.app.removerScan('scan-inexistente');
  assert.equal(app.app.scans.length, 1);
  app.close();
});

test('resetState zera lista, planilha, fila e agendamentos', async () => {
  const app = criarApp();

  await app.app.processScan({ type: 'nfe', key: CHAVE_UMA });
  app.app.pendingScans.push({ type: 'nfe', key: CHAVE_DUAS });
  app.app.marcarErro(app.app.scans[0], 'erro qualquer', true);

  app.click(app.document.getElementById('reset-btn'));

  assert.equal(app.app.scans.length, 0);
  assert.equal(app.app.tabelaProdutos.length, 0);
  assert.equal(app.app.pendingScans.length, 0, 'fila em espera é descartada');
  assert.equal(app.app.isProcessing, false);
  assert.equal(app.app.selectedScanId, null);
  assert.equal(app.document.getElementById('scan-count').textContent, '0');
  assert.equal(app.document.getElementById('status').innerText, 'conectando...');
  assert.equal(app.document.getElementById('detail-subtitle').textContent, 'Nenhuma nota selecionada.');
  assert.equal(app.document.getElementById('card-list').innerHTML, '');
  assert.match(app.document.getElementById('detail-view').innerHTML, /empty-state/);

  // O timer de auto-exclusão antigo não pode ressuscitar uma nota apagada.
  await app.clock.advance(20000);
  assert.equal(app.app.scans.length, 0, 'timers do estado anterior foram cancelados');
  app.close();
});

test.skip('editar/copy continua apontando para o produto certo depois de apagar outra nota', () => {
  // Intenção: apagar a nota A não pode desalinhar indexTabela da nota B.
  // Motivo do skip: BUG atual — tabelaProdutos é filtrada (índices deslizam) mas
  // produto.indexTabela continua apontando para a posição antiga, deixando os
  // inputs e o "Gerar linha" da nota B sem efeito (tabelaProdutos[index] undefined).
  // Corrigir na refatoração (ex.: indexar por key+posição estável) e desativar o skip.
});
