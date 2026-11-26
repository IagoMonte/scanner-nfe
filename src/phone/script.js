// ============================================================================
// src/phone/script.js — leitor de chave por OCR no celular
//
// Módulos: DOM/CONEXÃO (PeerJS com ID = PIN de 6 dígitos exibido na tela),
// CÂMERA (traseira 1920x1080), CAPTURA (recorte da faixa + preview),
// OCR (Tesseract, extração dos 44 dígitos e envio) e BOOT.
// ============================================================================

// ===== DOM =====

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const status = document.getElementById("status");
const captureBtn = document.getElementById("captureBtn");
const lastKey = document.getElementById("last-key");
const preview = document.getElementById("preview");
const pinEl = document.getElementById("pin");
const alvo = document.getElementById("alvo");

// Faixa do vídeo entregue ao OCR; a área verde é desenhada a partir dela.
const RECORTE_LARGURA = 0.92; // fração da largura do vídeo
const RECORTE_ALTURA = 90;    // pixels do vídeo

const PRAZO_ABERTURA_MS = 15000; // painel que não abre o canal nesse prazo é descartado
const RECONEXAO_MS = 3000;       // espera antes de voltar ao servidor de sinalização

// Texto + tom do selo (ok | wait | err), as mesmas cores de estado do viewer.
function definirStatus(texto, tipo) {
    status.innerText = texto;
    status.parentElement.dataset.tipo = tipo;
}

// ===== CONEXÃO =====
// O PIN gerado aqui É o PeerID da sessão do celular: quem digitar esse número
// no viewer conecta. O celular atende um painel por vez. O PIN evita conexões
// cruzadas, mas não é autenticação forte.

let conn = null;
let peer = null;

function novoPIN() {
    const [sorteio] = crypto.getRandomValues(new Uint32Array(1));
    return String(100000 + (sorteio % 900000));
}

function iniciarPeer(pin) {
    const atual = new Peer(pin);
    peer = atual;

    peer.on("connection", atenderViewer);
    peer.on("open", () => {
        if (status.textContent === "erro de conexão") definirStatus("conexão restabelecida", "ok");
    });
    peer.on("disconnected", () => setTimeout(() => {
        if (atual === peer && !atual.destroyed && atual.disconnected) atual.reconnect();
    }, RECONEXAO_MS));

    // PIN já em uso por outro peer no servidor: gera outro e a tela atualiza.
    peer.on("error", err => {
        if (err && err.type === "unavailable-id") {
            iniciarPeer(novoPIN());
            return;
        }
        // com um painel já ligado (P2P), a queda do servidor não interrompe o uso
        if (!conn?.open) definirStatus("erro de conexão", "err");
    });

    pinEl.innerText = pin;
}

function atenderViewer(connection) {
    // Já há um painel: o recém-chegado é desligado assim que o canal abre.
    if (conn) {
        connection.on("open", () => connection.close());
        return;
    }

    conn = connection;
    definirStatus("conectando viewer...", "wait");

    // Painel morto nem sempre emite "close": prazo de abertura e estado do WebRTC
    // também liberam o celular para o próximo.
    const liberar = () => {
        if (conn !== connection) return;
        conn = null;
        clearTimeout(prazo);
        definirStatus("viewer desconectado", "err");
        connection.close();
    };
    const prazo = setTimeout(liberar, PRAZO_ABERTURA_MS);

    connection.on("open", () => {
        clearTimeout(prazo);
        definirStatus("viewer conectado", "ok");
    });
    connection.on("close", liberar);
    connection.on("error", liberar);
    connection.peerConnection?.addEventListener("connectionstatechange", () => {
        if (connection.peerConnection?.connectionState === "failed") liberar();
    });
}

iniciarPeer(novoPIN());

// ===== CÂMERA =====

async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                aspectRatio: 16 / 9
            },
            audio: false
        });

        video.srcObject = stream;
        definirStatus(conn?.open ? "viewer conectado" : "câmera pronta", "ok");
    } catch (err) {
        console.error(err);
        definirStatus("erro câmera", "err");
    }
}

// ===== CAPTURA =====

function captureFrame() {
    const vw = video.videoWidth;
    const vh = video.videoHeight;

    const cropWidth = vw * RECORTE_LARGURA;
    const cropHeight = RECORTE_ALTURA;
    const cropX = (vw - cropWidth) / 2;
    const cropY = (vh / 2) - (cropHeight / 2);

    canvas.width = cropWidth;
    canvas.height = cropHeight;

    ctx.drawImage(
        video,
        cropX, cropY, cropWidth, cropHeight,
        0, 0, cropWidth, cropHeight
    );

    preprocess();
}

// Projeção do recorte no preview (sem pré-processamento)
function preprocess() {
    preview.src = canvas.toDataURL("image/png");
}

// Desenha a área verde com o tamanho que o recorte ocupa na tela. O vídeo usa
// object-fit: cover, então a escala é a maior das duas razões tela/vídeo.
function ajustarMira() {
    const { videoWidth, videoHeight, clientWidth, clientHeight } = video;
    if (!videoWidth || !videoHeight || !clientWidth) return;

    const escala = Math.max(clientWidth / videoWidth, clientHeight / videoHeight);
    alvo.style.width = `${videoWidth * RECORTE_LARGURA * escala}px`;
    alvo.style.height = `${RECORTE_ALTURA * escala}px`;
}

// ===== OCR =====

async function processOCR() {
    if (!conn?.open) {
        alert("viewer não conectado");
        return;
    }

    definirStatus("lendo chave...", "wait");
    captureFrame();

    try {
        const result = await Tesseract.recognize(
            canvas,
            "eng",
            {
                tessedit_pageseg_mode: 7,
                tessedit_char_whitelist: "0123456789",
                preserve_interword_spaces: 0
            }
        );

        let text = result.data.text;
        console.log(text);

        // limpa caracteres inválidos
        text = text.replace(/\D/g, "");

        // procura exatamente 44 dígitos
        const match = text.match(/\d{44}/);

        if (match) {
            const key = match[0];

            console.log("CHAVE:", key);
            lastKey.innerText = key;

            // o painel pode ter caído enquanto o OCR rodava
            if (!conn?.open) {
                definirStatus("chave não enviada", "err");
                navigator.vibrate?.(100);
                return;
            }

            conn.send({
                type: "nfe",
                key,
                image: canvas.toDataURL("image/jpeg", 0.7)
            });

            definirStatus("chave enviada", "ok");
            navigator.vibrate?.(300);
        } else {
            lastKey.innerText = text || "nenhum número encontrado";
            definirStatus(`faltando dígitos (${text.length}/44)`, "err");
            navigator.vibrate?.(100);
            console.log("OCR INVÁLIDO:", text);
        }
    } catch (err) {
        console.error(err);
        definirStatus("erro OCR", "err");
    }
}

// ===== BOOT =====
captureBtn.onclick = processOCR;
video.addEventListener("loadedmetadata", ajustarMira);
video.addEventListener("resize", ajustarMira); // câmera mudou de orientação
window.addEventListener("resize", ajustarMira);
startCamera();
