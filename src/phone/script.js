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

// ===== CONEXÃO =====
// O PIN gerado aqui É o PeerID da sessão do celular: quem digitar esse número
// no viewer conecta; quem não souber, não alcança este peer.

let conn = null;
let peer = null;

function novoPIN() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function iniciarPeer(pin) {
    peer = new Peer(pin);

    peer.on("connection", connection => {
        conn = connection;
        status.innerText = "viewer conectado";
    });

    // PIN já em uso por outro peer no servidor: gera outro e a tela atualiza.
    peer.on("error", err => {
        if (err && err.type === "unavailable-id") {
            iniciarPeer(novoPIN());
        }
    });

    pinEl.innerText = pin;
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
        status.innerText = "câmera pronta";
    } catch (err) {
        console.error(err);
        status.innerText = "erro câmera";
    }
}

// ===== CAPTURA =====

function captureFrame() {
    const vw = video.videoWidth;
    const vh = video.videoHeight;

    const cropWidth = vw * 0.92;
    const cropHeight = 90;
    const cropX = (vw - cropWidth) / 2;
    const cropY = (vh / 2) - 45;

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

// ===== OCR =====

async function processOCR() {
    if (!conn) {
        alert("viewer não conectado");
        return;
    }

    status.innerText = "lendo chave...";
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

            conn.send({
                type: "nfe",
                key,
                image: canvas.toDataURL("image/jpeg", 0.7)
            });

            lastKey.innerText = key;
            status.innerText = "chave enviada";
            navigator.vibrate?.(300);
        } else {
            lastKey.innerText = text || "nenhum número encontrado";
            status.innerText = `faltando dígitos (${text.length}/44)`;
            navigator.vibrate?.(100);
            console.log("OCR INVÁLIDO:", text);
        }
    } catch (err) {
        console.error(err);
        status.innerText = "erro OCR";
    }
}

// ===== BOOT =====
captureBtn.onclick = processOCR;
startCamera();
