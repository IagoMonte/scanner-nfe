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

// Busca manual de chave (topo do painel Notas) e saída do modal do PIN
const manualInput = document.getElementById('manual-key');
const manualButton = document.getElementById('manual-search-btn');
const manualError = document.getElementById('manual-error');
const manualSkip = document.getElementById('manual-skip');
