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


// Tick visual da contagem "apaga em Xs" dos cards de erro
setInterval(() => {
  if (scans.some(scan => scan.deleteAt)) renderUI();
}, 1000);
