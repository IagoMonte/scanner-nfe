// ============================================================================
// src/viewer/boot.js — conexão PeerJS com o celular via PIN
//
// O PIN digitado no modal É o PeerID da sessão do celular. O modal fica
// bloqueado até o usuário digitar um PIN de 6 dígitos; sem ele, nenhuma
// conexão parte do viewer (ninguém invade o peer do outro).
// ============================================================================

// Com ID próprio o PeerJS tenta reconectar mesmo se o servidor falhar já na
// abertura; sem ele, o peer é destruído e só recarregar resolve.
const peer = new Peer(`painel-${Math.random().toString(36).slice(2, 12)}`);
let conexaoAtual = null;

// Ao fechar ou recarregar a página, avisa o celular para ele aceitar o próximo.
window.addEventListener('pagehide', () => peer.destroy());
// Voltando pelo histórico a página vem do cache com o peer destruído: recarrega.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) window.location.reload();
});

peer.on('disconnected', () => setTimeout(() => {
  if (!peer.destroyed && peer.disconnected) peer.reconnect();
}, RECONEXAO_MS));

// PIN não existe / celular fora do ar no momento da tentativa:
// o modal volta com o aviso para um novo PIN.
peer.on('error', (err) => {
  // com o canal aberto, um aviso atrasado de outra tentativa não vale mais
  if (conexaoAtual?.open) return;

  if (err && err.type === 'peer-unavailable') {
    conexaoAtual = null; // a tentativa acabou: o prazo dela não troca o aviso
    pinError.innerText = 'PIN errado ou celular não encontrado.';
    pinError.hidden = false;
    pinModal.hidden = false;
  }
});

function tentarConectar() {
  if (pinModal.hidden) return; // já há uma tentativa em andamento

  const pin = pinInput.value.trim();

  if (!/^\d{6}$/.test(pin)) {
    pinError.innerText = 'O PIN tem 6 dígitos.';
    pinError.hidden = false;
    return;
  }

  // Antes de o painel se registrar no servidor o pedido se perde sem erro algum.
  if (!peer.open) {
    pinError.innerText = 'Ainda sem ligação com o servidor. Tente de novo em instantes.';
    pinError.hidden = false;
    return;
  }

  pinError.hidden = true;

  const conn = peer.connect(pin);
  conexaoAtual = conn;

  // Celular caiu, não respondeu ou recusou: nunca seguir "conectado".
  const encerrar = (motivo) => {
    if (conn !== conexaoAtual) return;
    conexaoAtual = null;
    clearTimeout(prazo);
    status.innerText = 'desconectado';
    loading.innerText = 'Conexão com o celular encerrada.';
    pinError.innerText = motivo;
    pinError.hidden = false;
    pinModal.hidden = false;
    conn.close();
  };
  const caiu = () => encerrar('Conexão encerrada ou perdida. O celular pode estar em uso por outro painel.');
  const prazo = setTimeout(
    () => encerrar('Sem resposta do celular. Confira o PIN e tente de novo.'),
    TIMEOUT_CONEXAO_MS
  );

  conn.on('close', caiu);
  conn.on('error', caiu);
  conn.peerConnection?.addEventListener('connectionstatechange', () => {
    if (conn.peerConnection?.connectionState === 'failed') caiu();
  });

  conn.on('open', () => {
    clearTimeout(prazo);
    status.innerText = 'conectado';
    loading.innerText = 'Pronto para receber novas leituras.';
  });

  conn.on('data', async (data) => {
    if (data && data.type === 'nfe') {
      pendingScans.push(data);
      processNextScan();
    }
  });

  pinModal.hidden = true;
}

// Modal: saída para a busca manual — libera a tela SEM conectar no celular
// (nenhum peer é tocado; o status segue "conectando..." até digitar um PIN).
function pularParaBuscaManual() {
  pinModal.hidden = true;
  manualInput.focus();
}
