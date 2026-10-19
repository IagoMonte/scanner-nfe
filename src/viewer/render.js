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
