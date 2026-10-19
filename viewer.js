// GERADO POR tools/build.js — NÃO EDITAR A MÃO: fonte em src/viewer/

// ===== src/viewer/config.js =====
// ============================================================================
// src/viewer/config.js — constantes de serviços e timings
//
// O prazo de auto-exclusão de card de erro usa o literal completo no ponto de
// uso (em domain.js): tests/sanity.py depende desse trecho exato para validar
// a suíte (não extrair constante nem mover para outro módulo).
// ============================================================================

const API_NFE_URL = 'https://dtgames.myddns.me/api/nfe/';
const API_NFE_FALLBACK_URL = 'https://dtgames.myddns.me/api/nfe/fallback/';
const API_RECEITA_URL = 'https://dtgames.myddns.me/receita/v1/cnpj/';

const TIMEOUT_CONSULTA_MS = 15000;        // teto da API primária antes de cair no fallback
const INTERVALO_ENTRE_NOTAS_MS = 1000;    // ritmo anti-429 entre consultas
const TTL_CARD_ERRO_MS = 15000;           // vida de um card de erro (timer de remoção)

const TEXTO_ESTADO_VAZIO = 'As notas recebidas aparecem na lista lateral. Ao selecionar uma, o card completo abre aqui.';

// ===== src/viewer/dom.js =====
// ============================================================================
// src/viewer/dom.js — referências aos elementos da página
// ============================================================================

const status = document.getElementById('status');
const loading = document.getElementById('loading');
const resetBtn = document.getElementById('reset-btn');
const cardList = document.getElementById('card-list');
const detailView = document.getElementById('detail-view');
const detailSubtitle = document.getElementById('detail-subtitle');
const scanCount = document.getElementById('scan-count');

// Modal de conexão por PIN
const pinModal = document.getElementById('pin-modal');
const pinInput = document.getElementById('pin-input');
const pinButton = document.getElementById('pin-btn');
const pinError = document.getElementById('pin-error');

// ===== src/viewer/state.js =====
// ============================================================================
// src/viewer/state.js — dados mutáveis do app
// ============================================================================

let pendingScans = [];
let tabelaProdutos = [];
let isProcessing = false;
let scans = [];
let selectedScanId = null;

// ===== src/viewer/utils.js =====
// ============================================================================
// src/viewer/utils.js — CNPJ, XML, datas, status e linha de planilha
// ============================================================================

function validarCNPJ(cnpj) {
  const limpo = String(cnpj || '').replace(/\D/g, '');
  if (limpo.length !== 14 || /^(\d)\1{13}$/.test(limpo)) return false;

  const calcularDigito = (base, pesos) => {
    const soma = base.split('').reduce((acc, digito, index) => acc + Number(digito) * pesos[index], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const base = limpo.slice(0, 12);
  const dig1 = calcularDigito(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dig2 = calcularDigito(base + dig1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return limpo === `${base}${dig1}${dig2}`;
}


function limparXML(valor = '') {
  return valor
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}


function formatarData(data) {
  if (!data) return '';
  const dataLimpa = data.split('T')[0];
  const [ano, mes, dia] = dataLimpa.split('-');
  return `${dia}/${mes}/${ano}`;
}


function gerarId() {
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}


function getStatusClass(tipo) {
  if (tipo === 'success') return 'ok';
  if (tipo === 'error') return 'err';
  return 'wait';
}


function getStatusLabel(tipo) {
  if (tipo === 'success') return 'Válido';
  if (tipo === 'error') return 'Erro';
  return 'Lendo';
}


/** Segundos restantes do card de erro, ou null quando não há exclusão agendada. */
function segundosAteApagar(scan) {
  if (!scan.deleteAt) return null;
  return Math.max(0, Math.ceil((scan.deleteAt - Date.now()) / 1000));
}


/** Linha no formato tab-separado esperado pelo Excel (ordem das colunas fixa). */
function montarLinhaPlanilha(item) {
  const quantidade = [item.quantidade, item.unidade].filter(Boolean).join(' ');
  return [
    item.key,
    item.produto,
    item.dataRecebimento,
    quantidade,
    item.fornecedor,
    formatarData(item.fabricacao),
    item.validadeMeses ? `${item.validadeMeses} meses` : '',
    item.notaFiscal
  ].join('\t');
}

// ===== src/viewer/api.js =====
// ============================================================================
// src/viewer/api.js — consulta do XML da nota (primária + fallback) e do CNPJ
// ============================================================================

/** API primária: devolve o XML em base64 (timeout e erro acionam o fallback). */
async function obterXMLPrimaria(chaveacesso) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_CONSULTA_MS);

  try {
    const resposta = await fetch(API_NFE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chave: chaveacesso }),
      signal: controller.signal
    });

    if (!resposta.ok) {
      throw new Error(`HTTP ${resposta.status}`);
    }

    const jsonRes = await resposta.json();
    if (jsonRes.status !== 'ok' || !jsonRes.xml_base64) {
      throw new Error('Resposta inválida da API primária.');
    }

    return atob(jsonRes.xml_base64);
  } finally {
    clearTimeout(timeoutId);
  }
}


/** Fallback proxyado (mesma origem): devolve o XML puro dentro de "xmlCode". */
async function obterXMLFallback(chaveacesso) {
  const fallbackRes = await fetch(`${API_NFE_FALLBACK_URL}${chaveacesso}`, {
    method: 'GET'
  });

  if (!fallbackRes.ok) {
    throw new Error(`Falha no fallback: HTTP ${fallbackRes.status}`);
  }

  const fallbackData = await fallbackRes.json();
  if (fallbackData && fallbackData.xmlCode) {
    return fallbackData.xmlCode;
  }

  throw new Error('Estrutura de resposta do fallback não contém xmlCode.');
}


/** Parseia o XML da NF-e e extrai nome/quantidade/unidade de cada produto. */
function extrairProdutosDoXML(xmlString) {
  const xmlDoc = new DOMParser().parseFromString(xmlString, 'text/xml');
  const parseError = xmlDoc.querySelector('parsererror');
  if (parseError) {
    throw new Error('XML inválido retornado pela API.');
  }

  const xProdNodes = xmlDoc.getElementsByTagName('xProd');
  const qComNodes = xmlDoc.getElementsByTagName('qCom');
  const uComNodes = xmlDoc.getElementsByTagName('uCom');

  const produtos = [];

  for (let i = 0; i < xProdNodes.length; i++) {
    const nome = limparXML(xProdNodes[i].textContent);
    const quantidade = qComNodes[i] ? limparXML(qComNodes[i].textContent) : '';
    const unidade = uComNodes[i] ? limparXML(uComNodes[i].textContent) : '';

    if (nome) {
      produtos.push({
        nome,
        quantidade,
        unidade,
        fabricacao: '',
        validadeMeses: ''
      });
    }
  }

  return produtos;
}


/** Consulta primária + fallback e parser do XML até chegar na lista de produtos. */
async function produtosbyxml(chaveacesso) {
  let xmlString;

  try {
    xmlString = await obterXMLPrimaria(chaveacesso);
  } catch (error) {
    console.warn('Falha ou timeout na API primária, acionando fallback...', error.message);
    xmlString = await obterXMLFallback(chaveacesso);
  }

  const produtos = extrairProdutosDoXML(xmlString);

  if (produtos.length === 0) {
    throw new Error('Nenhum produto encontrado no XML.');
  }

  return produtos;
}


async function buscarFornecedor(cnpj) {
  const resposta = await fetch(`${API_RECEITA_URL}${cnpj}`);
  const dados = await resposta.json();
  return dados?.nome || '';
}

// ===== src/viewer/domain.js =====
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

// ===== src/viewer/render.js =====
// ============================================================================
// src/viewer/render.js — montagem dos cards e atualização da tela
// ============================================================================

/** Cabeçalho comum aos três estados do card (chave + selo de status). */
function cabecalhoCard(scan) {
  return `
    <div class="card-top">
      <div>
        <div class="label">Chave NF-e</div>
        <div class="code">${scan.key}</div>
      </div>
      <span class="mini-tag ${getStatusClass(scan.status)}">${getStatusLabel(scan.status)}</span>
    </div>
  `;
}


function cardCarregando(scan) {
  return `
    <article class="scan-card loading">
      ${cabecalhoCard(scan)}
      <div class="loading-bar"><span></span></div>
      <div class="meta">
        <div class="meta-box"><div class="label">CNPJ</div><div class="value">${scan.cnpj}</div></div>
        <div class="meta-box"><div class="label">NF</div><div class="value">${scan.notaFiscal || '-'}</div></div>
      </div>
      <div class="footer-note">Buscando fornecedor e produtos.</div>
    </article>
  `;
}


function cardErro(scan) {
  const contador = segundosAteApagar(scan);

  return `
    <article class="scan-card error">
      ${cabecalhoCard(scan)}
      <div class="meta">
        <div class="meta-box"><div class="label">CNPJ</div><div class="value">${scan.cnpj || 'inválido'}</div></div>
        <div class="meta-box"><div class="label">NF</div><div class="value">${scan.notaFiscal || '-'}</div></div>
      </div>
      <div class="error-box">${scan.errorMessage}</div>
      <div class="footer-note" style="display: flex; justify-content: space-between; align-items: center;">
        <span>${contador !== null ? `Exclusão automática em ${contador}s.` : 'Erro mantido para conferência.'}</span>
        <button class="manual-delete-btn" data-scan-id="${scan.id}" style="background: #dc3545; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 14px;">Apagar Card</button>
      </div>
    </article>
  `;
}


function cardSucesso(scan) {
  const produtosHtml = scan.produtos.map(produto => {
    const quantidadeTexto = [produto.quantidade, produto.unidade].filter(Boolean).join(' ');
    return `
      <div class="product-item">
        <div class="product-head">
          <div>
            <div class="product-name">${produto.nome}</div>
            <div class="qty">Quantidade: ${quantidadeTexto || 'não informada'}</div>
          </div>
        </div>
        <div class="product-fields">
          <input type="date" class="fabricacao-input" data-index="${produto.indexTabela}" value="${produto.fabricacao || ''}" />
          <input type="number" min="0" class="validade-input" data-index="${produto.indexTabela}" value="${produto.validadeMeses || ''}" placeholder="Validade (meses)" />
          <button class="copy-btn generate-line-btn" data-index="${produto.indexTabela}">Gerar linha</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <article class="scan-card success">
      ${cabecalhoCard(scan)}
      <div class="meta">
        <div class="meta-box"><div class="label">CNPJ</div><div class="value">${scan.cnpj}</div></div>
        <div class="meta-box"><div class="label">NF</div><div class="value">${scan.notaFiscal || '-'}</div></div>
        <div class="meta-box wide"><div class="label">Fornecedor</div><div class="value">${scan.fornecedor || 'Não encontrado'}</div></div>
      </div>
      <div class="products">${produtosHtml || '<div class="error-box">Nenhum produto encontrado no XML.</div>'}</div>
      <div class="footer-note">Use "Gerar linha" para copiar o item no formato do Excel.</div>
    </article>
  `;
}


function atualizarContagem() {
  scanCount.textContent = String(scans.length);
}


function renderLista() {
  cardList.innerHTML = scans.map(scan => {
    const ativo = scan.id === selectedScanId ? 'active' : '';
    const erro = scan.status === 'error' ? 'error' : '';
    const contador = segundosAteApagar(scan);

    return `
      <button class="list-item ${ativo} ${erro}" data-scan-id="${scan.id}">
        <div class="list-top">
          <span class="mini-tag ${getStatusClass(scan.status)}">${getStatusLabel(scan.status)}</span>
          ${contador !== null ? `<span class="timer">apaga em ${contador}s</span>` : `<span class="timer">NF ${scan.notaFiscal || '-'}</span>`}
        </div>
        <div class="list-code">${scan.key}</div>
        <div class="footer-note">${scan.fornecedor || scan.errorMessage || 'Aguardando consulta.'}</div>
      </button>
    `;
  }).join('');
}


function renderDetalhe() {
  const scan = scans.find(item => item.id === selectedScanId);

  if (!scan) {
    detailSubtitle.textContent = 'Nenhuma nota selecionada.';
    detailView.innerHTML = `<div class="empty-state">${TEXTO_ESTADO_VAZIO}</div>`;
    return;
  }

  detailSubtitle.textContent = `NF ${scan.notaFiscal || '-'} • ${scan.cnpj || 'sem CNPJ'}`;

  if (scan.status === 'loading') {
    detailView.innerHTML = cardCarregando(scan);
    return;
  }

  if (scan.status === 'error') {
    detailView.innerHTML = cardErro(scan);
    return;
  }

  detailView.innerHTML = cardSucesso(scan);
}


function renderUI() {
  atualizarContagem();
  renderLista();
  renderDetalhe();
}

// ===== src/viewer/events.js =====
// ============================================================================
// src/viewer/events.js — listeners de clique, input, reset e tick do relógio
// ============================================================================

cardList.addEventListener('click', (e) => {
  // Ignora cliques no botão de apagar para não selecionar o card acidentalmente
  if (e.target.closest('.manual-delete-btn')) return;

  const botao = e.target.closest('[data-scan-id]');
  if (!botao) return;
  selectedScanId = botao.dataset.scanId;
  renderUI();
});


document.addEventListener('input', (e) => {
  const index = e.target.dataset.index;
  if (!tabelaProdutos[index]) return;

  if (e.target.classList.contains('fabricacao-input')) {
    tabelaProdutos[index].fabricacao = e.target.value;
  }

  if (e.target.classList.contains('validade-input')) {
    tabelaProdutos[index].validadeMeses = e.target.value;
  }
});


document.addEventListener('click', async (e) => {
  // Copia a linha da planilha correspondente ao produto
  const btn = e.target.closest('.generate-line-btn');
  if (btn) {
    const item = tabelaProdutos[btn.dataset.index];
    if (!item) return;

    await navigator.clipboard.writeText(montarLinhaPlanilha(item));
    const textoOriginal = btn.innerText;
    btn.innerText = 'Copiado';
    setTimeout(() => {
      btn.innerText = textoOriginal;
    }, 1200);
    return;
  }

  // Apaga card de erro manualmente
  const deleteBtn = e.target.closest('.manual-delete-btn');
  if (deleteBtn) {
    removerScan(deleteBtn.dataset.scanId);
    return;
  }
});


resetBtn.addEventListener('click', resetState);


// Modal de PIN: botão Conectar e Enter no campo disparam a mesma tentativa.
pinButton.addEventListener('click', tentarConectar);
pinInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') tentarConectar();
});


// Tick visual da contagem "apaga em Xs" dos cards de erro
setInterval(() => {
  if (scans.some(scan => scan.deleteAt)) renderUI();
}, 1000);

// ===== src/viewer/boot.js =====
// ============================================================================
// src/viewer/boot.js — conexão PeerJS com o celular via PIN
//
// O PIN digitado no modal É o PeerID da sessão do celular. O modal fica
// bloqueado até o usuário digitar um PIN de 6 dígitos; sem ele, nenhuma
// conexão parte do viewer (ninguém invade o peer do outro).
// ============================================================================

const peer = new Peer();

// PIN não existe / celular fora do ar no momento da tentativa:
// o modal volta com o aviso para um novo PIN.
peer.on('error', (err) => {
  if (err && err.type === 'peer-unavailable') {
    pinError.innerText = 'PIN errado ou celular não encontrado.';
    pinError.hidden = false;
    pinModal.hidden = false;
  }
});

function tentarConectar() {
  const pin = pinInput.value.trim();

  if (!/^\d{6}$/.test(pin)) {
    pinError.innerText = 'O PIN tem 6 dígitos.';
    pinError.hidden = false;
    return;
  }

  pinError.hidden = true;

  const conn = peer.connect(pin);

  conn.on('open', () => {
    status.innerText = 'conectado';
    loading.innerText = 'Pronto para receber novas leituras.';
  });

  conn.on('data', async (data) => {
    if (data.type === 'nfe') {
      pendingScans.push(data);
      processNextScan();
    }
  });

  pinModal.hidden = true;
}
