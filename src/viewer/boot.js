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

// Modal: saída para a busca manual — libera a tela SEM conectar no celular
// (nenhum peer é tocado; o status segue "conectando..." até digitar um PIN).
function pularParaBuscaManual() {
  pinModal.hidden = true;
  manualInput.focus();
}
