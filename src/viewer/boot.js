// ============================================================================
// src/viewer/boot.js — conexão PeerJS com o celular (id fixo "phone-ocr")
// ============================================================================

const peer = new Peer();


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
