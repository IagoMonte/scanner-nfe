const peer = new Peer();

const status = document.getElementById('status');
const loading = document.getElementById('loading');
const resetBtn = document.getElementById('reset-btn');
const cardList = document.getElementById('card-list');
const detailView = document.getElementById('detail-view');
const detailSubtitle = document.getElementById('detail-subtitle');
const scanCount = document.getElementById('scan-count');

let pendingScans = [];
let tabelaProdutos = [];
let isProcessing = false;
let scans = [];
let selectedScanId = null;


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


function atualizarContagem() {
  scanCount.textContent = String(scans.length);
}


function agendarExclusao(scan) {
  scan.deleteAt = Date.now() + 15000;
  if (scan.deleteTimer) clearTimeout(scan.deleteTimer);

  scan.deleteTimer = setTimeout(() => {
    removerScan(scan.id);
  }, 15000);
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


function renderLista() {
  cardList.innerHTML = scans.map(scan => {
    const ativo = scan.id === selectedScanId ? 'active' : '';
    const erro = scan.status === 'error' ? 'error' : '';
    const contador = scan.deleteAt ? Math.max(0, Math.ceil((scan.deleteAt - Date.now()) / 1000)) : null;

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
    detailView.innerHTML = '<div class="empty-state">As notas recebidas aparecem na lista lateral. Ao selecionar uma, o card completo abre aqui.</div>';
    return;
  }

  detailSubtitle.textContent = `NF ${scan.notaFiscal || '-'} • ${scan.cnpj || 'sem CNPJ'}`;

  if (scan.status === 'loading') {
    detailView.innerHTML = `
      <article class="scan-card loading">
        <div class="card-top">
          <div>
            <div class="label">Chave NF-e</div>
            <div class="code">${scan.key}</div>
          </div>
          <span class="mini-tag wait">Lendo</span>
        </div>
        <div class="loading-bar"><span></span></div>
        <div class="meta">
          <div class="meta-box"><div class="label">CNPJ</div><div class="value">${scan.cnpj}</div></div>
          <div class="meta-box"><div class="label">NF</div><div class="value">${scan.notaFiscal || '-'}</div></div>
        </div>
        <div class="footer-note">Buscando fornecedor e produtos.</div>
      </article>
    `;
    return;
  }

  if (scan.status === 'error') {
    const contador = scan.deleteAt ? Math.max(0, Math.ceil((scan.deleteAt - Date.now()) / 1000)) : null;
    detailView.innerHTML = `
      <article class="scan-card error">
        <div class="card-top">
          <div>
            <div class="label">Chave NF-e</div>
            <div class="code">${scan.key}</div>
          </div>
          <span class="mini-tag err">Erro</span>
        </div>
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
    return;
  }

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

  detailView.innerHTML = `
    <article class="scan-card success">
      <div class="card-top">
        <div>
          <div class="label">Chave NF-e</div>
          <div class="code">${scan.key}</div>
        </div>
        <span class="mini-tag ok">Válido</span>
      </div>
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


function renderUI() {
  atualizarContagem();
  renderLista();
  renderDetalhe();
}


// ========== CONSULTA API COM TIMEOUT E FALLBACK ==========
async function produtosbyxml(chaveacesso) {
  let xmlString = '';

  // 1. Tenta a API primária com timeout de 30 segundos
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 30 segundos máximo

    const API_URL = 'https://dtgames.myddns.me/api/nfe/';
    const resposta = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chave: chaveacesso }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!resposta.ok) {
      throw new Error(`HTTP ${resposta.status}`);
    }

    const jsonRes = await resposta.json();
    if (jsonRes.status !== 'ok' || !jsonRes.xml_base64) {
      throw new Error('Resposta inválida da API primária.');
    }

    xmlString = atob(jsonRes.xml_base64);
  } catch (error) {
    console.warn('Falha ou timeout na API primária, acionando fallback...', error.message);
    
    // 2. Fallback proxyado para evitar CORS (mesma origem, sem bloqueio de preflight)
    const FALLBACK_URL = `https://dtgames.myddns.me/api/nfe/fallback/${chaveacesso}`;
    const fallbackRes = await fetch(FALLBACK_URL, {
      method: 'GET'
    });

    if (!fallbackRes.ok) {
      throw new Error(`Falha no fallback: HTTP ${fallbackRes.status}`);
    }

    const fallbackData = await fallbackRes.json();
    
    // O formato da resposta do fallback tem "xmlCode" com o XML puro (string)
    if (fallbackData && fallbackData.xmlCode) {
      xmlString = fallbackData.xmlCode;
    } else {
      throw new Error('Estrutura de resposta do fallback não contém xmlCode.');
    }
  }

  // 3. Parseia XML
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  const parseError = xmlDoc.querySelector('parsererror');
  if (parseError) {
    throw new Error('XML inválido retornado pela API.');
  }

  // 4. Extrai produtos: xProd, qCom, uCom
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

  if (produtos.length === 0) {
    throw new Error('Nenhum produto encontrado no XML.');
  }

  return produtos;
}


async function buscarFornecedor(cnpj) {
  const resposta = await fetch(`https://dtgames.myddns.me/receita/v1/cnpj/${cnpj}`);
  const dados = await resposta.json();
  return dados?.nome || '';
}


function marcarErro(scan, mensagem, autoDelete = false) {
  scan.status = 'error';
  scan.errorMessage = mensagem;
  if (autoDelete) agendarExclusao(scan);
  renderUI();
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

      const indexTabela = tabelaProdutos.length - 1;
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
      // Delay de 1 segundo entre as requisições para evitar "Too Many Requests" (429)
      setTimeout(() => processNextScan(), 1000);
    }
  }
}


function resetState() {
  status.innerText = 'conectando...';
  loading.style.display = 'block';
  cardList.innerHTML = '';
  detailView.innerHTML = '<div class="empty-state">As notas recebidas aparecem na lista lateral. Ao selecionar uma, o card completo abre aqui.</div>';
  detailSubtitle.textContent = 'Nenhuma nota selecionada.';
  pendingScans = [];
  tabelaProdutos = [];
  isProcessing = false;
  scans.forEach(scan => scan.deleteTimer && clearTimeout(scan.deleteTimer));
  scans = [];
  selectedScanId = null;
  renderUI();
}


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
  // Lógica para copiar linha
  const btn = e.target.closest('.generate-line-btn');
  if (btn) {
    const index = btn.dataset.index;
    const item = tabelaProdutos[index];
    if (!item) return;

    const quantidade = [item.quantidade, item.unidade].filter(Boolean).join(' ');
    const linha = [
      item.key,
      item.produto,
      item.dataRecebimento,
      quantidade,
      item.fornecedor,
      formatarData(item.fabricacao),
      item.validadeMeses ? `${item.validadeMeses} meses` : '',
      item.notaFiscal
    ].join('\t');

    await navigator.clipboard.writeText(linha);
    const textoOriginal = btn.innerText;
    btn.innerText = 'Copiado';
    setTimeout(() => {
      btn.innerText = textoOriginal;
    }, 1200);
    return;
  }

  // Lógica para apagar card de erro manualmente
  const deleteBtn = e.target.closest('.manual-delete-btn');
  if (deleteBtn) {
    removerScan(deleteBtn.dataset.scanId);
    return;
  }
});


resetBtn.addEventListener('click', resetState);


setInterval(() => {
  if (scans.some(scan => scan.deleteAt)) renderUI();
}, 1000);


peer.on('open', () => {
  const conn = peer.connect('phone-ocr');

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
});