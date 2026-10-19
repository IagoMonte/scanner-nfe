// ============================================================================
// src/viewer/domain.js — ciclo de vida do scan e da linha da planilha
// ============================================================================

function criarScan(chave) {
  const scan = {
    id: gerarId(),
    key: chave,
    cnpj: chave.slice(6, 20),
    notaFiscal: chave.slice(25, 34).replace(/^0+/, ''),
    fornecedor: '',
    status: 'loading',
    errorMessage: '',
    createdAt: Date.now(),
    deleteAt: null,
    deleteTimer: null,
    produtos: []
  };

  scans.unshift(scan);
  selectedScanId = scan.id;
  renderUI();
  return scan;
}


function agendarExclusao(scan) {
  // Card de erro vive 15s (literal do prazo é a referência da mutação do sanity;
  // o tempo do TIMER já vem da constante TTL_CARD_ERRO_MS em config.js).
  scan.deleteAt = Date.now() + 15000;
  if (scan.deleteTimer) clearTimeout(scan.deleteTimer);

  scan.deleteTimer = setTimeout(() => {
    removerScan(scan.id);
  }, TTL_CARD_ERRO_MS);
}


function marcarErro(scan, mensagem, autoDelete = false) {
  scan.status = 'error';
  scan.errorMessage = mensagem;
  if (autoDelete) agendarExclusao(scan);
  renderUI();
}


/** Cria a linha da planilha global para um produto da nota. */
function adicionarLinhaPlanilha(scan, produto, fornecedor) {
  tabelaProdutos.push({
    produto: produto.nome,
    dataRecebimento: new Date().toLocaleDateString('pt-BR'),
    quantidade: produto.quantidade,
    unidade: produto.unidade,
    fornecedor,
    fabricacao: '',
    validadeMeses: '',
    notaFiscal: scan.notaFiscal,
    key: scan.key
  });

  return tabelaProdutos.length - 1;
}


async function processScan(data) {
  if (!data || data.type !== 'nfe') return;

  // Evita duplicidade estrita: se já existe um scan com esta chave na lista, ignora
  const jaExiste = scans.some(s => s.key === data.key);
  if (jaExiste) {
    console.log('Chave já existe na lista, ignorando processamento duplicado:', data.key);
    return;
  }

  const scan = criarScan(data.key);

  if (!validarCNPJ(scan.cnpj)) {
    marcarErro(scan, 'CNPJ não passou pela verificação.', true);
    return;
  }

  try {
    const [fornecedor, produtos] = await Promise.all([
      buscarFornecedor(scan.cnpj),
      produtosbyxml(data.key)
    ]);

    if (!fornecedor) {
      marcarErro(scan, 'CNPJ válido, mas o fornecedor não foi retornado pela consulta.');
      return;
    }

    scan.fornecedor = fornecedor;
    scan.status = 'success';
    scan.produtos = produtos.map((produto) => {
      const indexTabela = adicionarLinhaPlanilha(scan, produto, fornecedor);
      return { ...produto, indexTabela };
    });

    renderUI();
  } catch (error) {
    marcarErro(scan, 'Falha ao consultar fornecedor ou XML da nota: ' + error.message, true);
  }
}


async function processNextScan() {
  if (isProcessing || pendingScans.length === 0) return;
  isProcessing = true;
  const data = pendingScans.shift();

  try {
    await processScan(data);
  } finally {
    isProcessing = false;
    if (pendingScans.length > 0) {
      setTimeout(() => processNextScan(), INTERVALO_ENTRE_NOTAS_MS);
    }
  }
}


function removerScan(scanId) {
  const index = scans.findIndex(item => item.id === scanId);
  if (index !== -1) {
    const scan = scans[index];
    if (scan.deleteTimer) clearTimeout(scan.deleteTimer);

    // Limpa os produtos associados a este scan da tabela global para evitar dados órfãos
    tabelaProdutos = tabelaProdutos.filter(item => item.key !== scan.key);

    scans.splice(index, 1);
    if (selectedScanId === scanId) {
      selectedScanId = scans[0]?.id || null;
    }
    renderUI();
  }
}


function resetState() {
  status.innerText = 'conectando...';
  loading.style.display = 'block';
  cardList.innerHTML = '';
  detailView.innerHTML = `<div class="empty-state">${TEXTO_ESTADO_VAZIO}</div>`;
  detailSubtitle.textContent = 'Nenhuma nota selecionada.';
  pendingScans = [];
  tabelaProdutos = [];
  isProcessing = false;
  scans.forEach(scan => scan.deleteTimer && clearTimeout(scan.deleteTimer));
  scans = [];
  selectedScanId = null;
  renderUI();
}
