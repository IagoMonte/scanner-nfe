'use strict';

/**
 * Harness de testes: carrega o código REAL do navegador (viewer.html + viewer.js,
 * phone.html) dentro de um jsdom, injetando só as fronteiras externas que não
 * podemos usar em teste (PeerJS, fetch/das APIs, clipboard, relógio).
 *
 * Nada da lógica de produção é copiado ou reescrito aqui — o objetivo é travar o
 * comportamento atual para que a refatoração não quebre o app em silêncio.
 */

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');

const viewerHtml = fs.readFileSync(path.join(ROOT, 'viewer.html'), 'utf8');
const viewerJs = fs.readFileSync(path.join(ROOT, 'viewer.js'), 'utf8');
const phoneHtml = fs.readFileSync(path.join(ROOT, 'phone.html'), 'utf8');

/** Deixa microtasks/encadeamentos assíncronos assentarem antes de asserções. */
async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

/**
 * Relógio controlado: o código usa setTimeout/setInterval (auto-exclusão de 15s,
 * delay de 1s da fila, feedback do botão "Copiado") e Date.now() para contagens.
 * Só os timers entram no relógio virtual; Date.now continua real.
 */
function createClock(win) {
  let now = 0;
  let seq = 0;
  const timers = new Map();

  const add = (cb, delay, args, interval) => {
    const id = ++seq;
    timers.set(id, {
      id,
      at: now + Math.max(0, Number(delay) || 0),
      order: seq,
      interval: interval ? Math.max(1, Number(delay) || 1) : 0,
      cb: () => cb(...args),
    });
    return id;
  };

  win.setTimeout = (cb, delay, ...args) => add(cb, delay, args, false);
  win.setInterval = (cb, delay, ...args) => add(cb, delay, args, true);
  win.clearTimeout = (id) => { timers.delete(id); };
  win.clearInterval = (id) => { timers.delete(id); };

  return {
    get now() { return now; },
    pending: () => timers.size,
    has: (id) => timers.has(id),
    /** Avança o tempo virtual disparando os timers vencidos, em ordem. */
    async advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.values()]
          .filter((t) => t.at <= target)
          .sort((a, b) => a.at - b.at || a.order - b.order)[0];
        if (!due) break;
        now = due.at;
        if (due.interval) due.at = now + due.interval;
        else timers.delete(due.id);
        due.cb();
        await flush();
      }
      now = target;
      await flush();
    },
  };
}

/** Stub do PeerJS: registra handlers e permite disparar open/data manualmente. */
function createPeerStub() {
  const state = { created: 0, peerIds: [], connectedTo: null, conn: null, sent: [], peerHandlers: {}, connHandlers: {} };

  function PeerStub(peerId) {
    state.created += 1;
    state.peerIds.push(peerId);
    const peer = {
      on(event, cb) { (state.peerHandlers[event] ||= []).push(cb); },
      connect(peerId) {
        state.connectedTo = peerId;
        return state.conn;
      },
    };
    state.conn = {
      on(event, cb) { (state.connHandlers[event] ||= []).push(cb); },
      send(payload) { state.sent.push(payload); },
    };
    return peer;
  }

  return {
    Peer: PeerStub,
    state,
    emitPeer: (event, ...args) => (state.peerHandlers[event] || []).forEach((cb) => cb(...args)),
    emitConn: (event, ...args) => (state.connHandlers[event] || []).forEach((cb) => cb(...args)),
  };
}

/** fetch controlado: rotas por substring da URL; URL sem rota = falha ruidosa. */
function createFetch(win) {
  const calls = [];
  const routes = [];

  const fetchStub = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : String(input && input.url);
    const call = {
      url,
      method: String(init.method || 'GET').toUpperCase(),
      body: init.body ?? null,
      signal: init.signal ?? null,
    };
    calls.push(call);

    const route = routes.find((r) => url.includes(r.match));
    if (!route) {
      throw new Error(`fetch sem rota de teste: ${call.method} ${url}`);
    }
    return route.handler(call);
  };

  fetchStub.calls = calls;
  // Registrar a mesma rota de novo substitui no lugar (permite um teste sobrescrever
  // o cenário sem inverter a ordem — a ordem importa porque "/api/nfe/" casa também
  // com a URL do fallback).
  fetchStub.on = (match, handler) => {
    const existente = routes.findIndex((r) => r.match === match);
    if (existente !== -1) routes[existente] = { match, handler };
    else routes.push({ match, handler });
    return fetchStub;
  };
  fetchStub.urlsFor = (match) => calls.filter((c) => c.url.includes(match)).map((c) => c.url);

  win.fetch = fetchStub;
  return fetchStub;
}

function jsonResponse(data, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => data };
}

/** jsdom não implementa innerText; espelha em textContent (elementos folha usados no app). */
function shimInnerText(win) {
  if ('innerText' in win.HTMLElement.prototype) return;
  Object.defineProperty(win.HTMLElement.prototype, 'innerText', {
    configurable: true,
    get() { return this.textContent; },
    set(value) { this.textContent = value == null ? '' : String(value); },
  });
}

/**
 * Expõe as funções internas do viewer.js para teste SEM alterar o arquivo de
 * produção: o snippet roda no mesmo eval, portanto enxerga o escopo completo.
 */
const VIEWER_EXPORTS = `
;window.__app = {
  validarCNPJ, limparXML, formatarData, getStatusClass, getStatusLabel,
  criarScan, agendarExclusao, removerScan, marcarErro,
  processScan, processNextScan, produtosbyxml, buscarFornecedor,
  resetState, renderUI, renderLista, renderDetalhe,
  get scans() { return scans; },
  get selectedScanId() { return selectedScanId; },
  get tabelaProdutos() { return tabelaProdutos; },
  get pendingScans() { return pendingScans; },
  get isProcessing() { return isProcessing; }
};
`;

const PHONE_EXPORTS = `
;window.__phone = {
  startCamera, captureFrame, preprocess, processOCR,
  get conn() { return conn; },
  get peer() { return peer; }
};
`;

function createViewerApp() {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(viewerHtml, { runScripts: 'outside-only', url: 'https://dtgames.myddns.me/', virtualConsole });
  const win = dom.window;

  shimInnerText(win);

  const clock = createClock(win);
  const peer = createPeerStub();
  const fetchStub = createFetch(win);

  const clipboard = { texts: [], async writeText(text) { clipboard.texts.push(text); } };
  Object.defineProperty(win.navigator, 'clipboard', { value: clipboard, configurable: true });

  const alerts = [];
  win.alert = (message) => alerts.push(message);

  win.Peer = peer.Peer;
  win.eval(`${viewerJs}\n${VIEWER_EXPORTS}`);

  const doc = win.document;
  const app = win.__app;

  return {
    window: win,
    document: doc,
    app,
    clock,
    peer,
    fetch: fetchStub,
    clipboard,
    alerts,
    /** Abre o canal P2P como o viewer faz: modal → digita o PIN → Conectar → conn abre. */
    connect(pin = '123456') {
      const campo = doc.getElementById('pin-input');
      campo.value = pin;
      campo.dispatchEvent(new win.Event('input', { bubbles: true }));
      const botao = doc.getElementById('pin-btn');
      botao.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      peer.emitConn('open');
    },
    /** Entrega um payload como se viesse do celular. */
    async receive(data) {
      peer.emitConn('data', data);
      await flush();
    },
    /** Entrega sem dar tempo de resolve — para encher a fila de uma vez. */
    emit(data) {
      peer.emitConn('data', data);
    },
    async sendKey(key) {
      await this.receive({ type: 'nfe', key });
      await flush();
    },
    $: (selector) => doc.querySelector(selector),
    $$: (selector) => [...doc.querySelectorAll(selector)],
    click(element) {
      element.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    },
    type(element, value) {
      element.value = value;
      element.dispatchEvent(new win.Event('input', { bubbles: true }));
    },
    close() {
      win.close();
    },
  };
}

function createPhoneApp() {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(phoneHtml, { runScripts: 'outside-only', url: 'https://dtgames.myddns.me/', virtualConsole });
  const win = dom.window;

  shimInnerText(win);

  const clock = createClock(win);
  const peer = createPeerStub();

  win.Peer = peer.Peer;

  const alerts = [];
  win.alert = (message) => alerts.push(message);

  const camera = {
    calls: [],
    async getUserMedia(constraints) {
      camera.calls.push(constraints);
      return { getTracks: () => [] };
    },
  };
  Object.defineProperty(win.navigator, 'mediaDevices', { value: camera, configurable: true });

  const vibes = [];
  Object.defineProperty(win.navigator, 'vibrate', {
    value: (ms) => { vibes.push(ms); return true; },
    configurable: true,
  });

  const canvasState = { drawCalls: [], dataUrls: [] };
  win.HTMLCanvasElement.prototype.getContext = () => ({
    drawImage: (...args) => canvasState.drawCalls.push(args),
  });
  win.HTMLCanvasElement.prototype.toDataURL = (...args) => {
    canvasState.dataUrls.push(args);
    return 'data:image/png;base64,AAAA';
  };

  const video = win.document.getElementById('video');
  Object.defineProperty(video, 'videoWidth', { value: 1920, configurable: true });
  Object.defineProperty(video, 'videoHeight', { value: 1080, configurable: true });

  const ocr = { text: '', calls: [] };
  win.Tesseract = {
    async recognize(target, language, options) {
      ocr.calls.push({ target, language, options });
      return { data: { text: ocr.text } };
    },
  };

  const script = (phoneHtml.match(/<script>\s*([\s\S]*?)\s*<\/script>/) || [])[1];
  if (!script) throw new Error('script inline do phone.html não encontrado');
  win.eval(`${script}\n${PHONE_EXPORTS}`);

  const phone = win.__phone;

  return {
    window: win,
    document: win.document,
    phone,
    clock,
    peer,
    ocr,
    alerts,
    camera,
    vibes,
    canvasState,
    /** Simula o viewer conectando (conexão chega no peer do celular). */
    connectViewer() {
      const sent = [];
      peer.emitPeer('connection', { send: (payload) => sent.push(payload) });
      return sent;
    },
    close() { win.close(); },
  };
}

module.exports = { ROOT, viewerHtml, viewerJs, phoneHtml, flush, createViewerApp, createPhoneApp, jsonResponse };
