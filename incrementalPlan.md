# incrementalPlan — Scanner NF-e

## Objetivo
Cobrir a lógica de funcionamento com testes automatizados antes da refatoração
que antecede a subida para o GitHub, para que a refac não quebre nada em silêncio.

## Regra de ouro desta etapa
Não alterar `viewer.js`, `phone.html`, `viewer.html` nem `api.py`. Os testes
executam o código **como está** (sem reescrever a lógica para "testável").
Única alteração fora de testes: `.gitignore` ganhou `node_modules/`.

## Feito
- [x] Suíte de testes — **61 testes JS: 57 pass, 0 fail, 4 skip intencionais** + **5 testes Python: OK**
  - `tests/helpers/harness.js` — jsdom + relógio virtual + fetch/Peer/clipboard controlados.
  - `tests/helpers/fixtures.js` — chaves reais de 44 dígitos e XML de nota.
  - `tests/viewer.core.test.js` — CNPJ, `limparXML`, datas, labels de status, layout da chave.
  - `tests/viewer.api.test.js` — API primária, fallback (status/HTTP/rede/timeout 15s), XML inválido, sem produtos, fornecedor.
  - `tests/viewer.scan.test.js` — processScan (dedup, CNPJ inválido, sucesso, sem fornecedor, rede), removerScan/reset.
  - `tests/viewer.queue.test.js` — fila serial com 1s, guarda de `isProcessing`, auto-exclusão de 15s.
  - `tests/viewer.ui.test.js` — cards por estado, seleção, inputs, **linha da planilha no clipboard**.
  - `tests/phone.ocr.test.js` — câmera, recorte 92%/90px, extração de 44 dígitos, payload, feedback.
  - `tests/test_api_cli.py` — validação de CLI + filtro CDP (PUT/requestId) + aviso de timeout.
  - `tests/sanity.py` — **mutações induzidas: 8/8 detectadas** (teste que não falha não vale).
- Comandos: `npm test`, `npm run test:py`, `python3 tests/sanity.py`.
- README ganhou seção "Testes".
- [x] Refatoração modular KISS com a suíte verde (viewer.js, phone.html, api.py)
  - Cada arquivo continua unidade executável única (contrato do harness/sanity), reorganizado
    internamente em módulos com banner: CONFIG/DOM/ESTADO/UTILS/API/DOMÍNIO/RENDER/EVENTOS/BOOT
    (viewer) e DOM/CONEXÃO/CÂMERA/CAPTURA/OCR/BOOT (phone); api.py virou funções pequenas.
  - Dedup real: `segundosAteApagar` (contador repetido 2x), `cabecalhoCard`/templates por estado,
    `montarLinhaPlanilha`, `adicionarLinhaPlanilha`, `obterXMLPrimaria/Fallback/extrairProdutosDoXML`,
    TEXTO_ESTADO_VAZIO, URLs e timings nomeados.
  - Comentário do timeout da API primária corrigido (dizia 30s, código usa 15s) — plano concatem.
  - Markup, mensagens, fluxo e timings byte-idênticos: `npm test` (57/4 skip), `test:py` (5 OK)
    e `tests/sanity.py` (8/8 mutações detectadas) verdes após o refactor.
- [x] Modularização REAL: fonte em `src/viewer/*.js` (9 módulos) e `src/phone/`
  (template + script), `tools/build.js` zero-dep concatenando nos artefatos
  (`viewer.js`, `phone.html`) com validação do contrato da suíte no build.
  `package.json` ganhou `build`; `npm test` roda build antes. `api.py` segue em
  arquivo único (nativo + literal pinado in-file). `tests/` intocado. Verificado:
  `npm test` (57/4 skip), `test:py` (5 OK), `tests/sanity.py` (8/8) e screenshots
  de viewer/phone gerados pelos artefatos.

- [x] Conexão por PIN (anti-invasão de peer): celular gera PIN de 6 dígitos que
  É o PeerID da sessão e o exibe na tela; colisão (`unavailable-id`) regenera.
  Viewer conecta só pelo modal bloqueado com backdrop blur (`viewer.html`);
  PIN inválido dá erro no modal, `peer-unavailable` reabre com aviso.
  - `src/phone/script.js` (`novoPIN`/`iniciarPeer`), `src/phone/index.html` (caixa `#pin`),
    `src/viewer/` (`dom.js` refs do modal, `boot.js` `tentarConectar`, `events.js` botão+Enter),
    `viewer.html` (markup + CSS `#pin-modal`). Id fixo `phone-ocr` eliminado (risco resolvido).
  - TDD: `tests/phone.pin.test.js` + `tests/viewer.pin.test.js` (9 novos, red
    confirmado antes). Harness: PeerStub registra `peerIds`, `connect()` passa
    pelo fluxo do modal. Suíte: **70 testes — 66 pass, 0 fail, 4 skip intencionais**,
    sanity 8/8. Screenshots do modal/erro/PIN no phone verificados (visual.md).

- [x] Busca manual de chave no viewer (digitada, sem celular)
  - Campo `#manual-key` no topo do painel **Notas** (input largura total + botão "Buscar"
    abaixo, erro `#manual-error` reusando `.error-box`) e link "ou buscar chave manualmente"
    no modal do PIN (`#manual-skip`) que libera a tela **sem tocar no peer**.
  - `buscarChaveManual()` (domain.js) normaliza para dígitos, exige 44, barra duplicata em
    `scans` **e** `pendingScans` (aviso + foco no card existente) e enfileira em
    `pendingScans` + `processNextScan()` — MESMO pipeline do celular, sem caminho paralelo.
  - Conflito com o `visual.md` resolvido (Rule 5): a regra "modal bloqueado sem nada a fazer
    sem conexão" passou a ter a saída da busca manual; spec nova em visual.md.
  - TDD: `tests/viewer.manual.test.js` (8 novos, red confirmado antes). Suíte:
    **78 testes — 74 pass, 0 fail, 4 skip intencionais**; `test:py` 5 OK; sanity 8/8.
  - UI verificada no Chromium (44 dígitos cabem sem scroll com Satoshi; botão/erro sem
    overflow) e em produção (`dtgames.myddns.me`) após deploy — avisos de formato e
    duplicata funcionando no ar.
  - **Bug de backend exposto (fora do escopo):** a consulta de XML falha em produção —
    `POST /api/nfe/` → 400 e fallback → **401** (provável `x-api-key` do
    `/etc/nginx/secrets/danferapida.key.conf`); `GET /receita/` responde 200.

## Próxima tarefa
1. Corrigir os 4 bugs marcados com `test.skip` e desativar os skips (agora em `src/`).
2. **Novo:** investigar o 401 do fallback do XML em produção (`POST /api/nfe/` 400).

## Backlog — bugs conhecidos encontrados ao escrever os testes
1. **`indexTabela` vira órfão** ao apagar uma nota: `tabelaProdutos` é filtrada
   (índices deslizam) mas `produto.indexTabela` guarda a posição antiga → inputs e
   "Gerar linha" da nota restante param de funcionar. (skip em `viewer.scan.test.js`)
2. **Inputs perdem o valor em qualquer re-render**: o handler grava em
   `tabelaProdutos`, o card é montado de `scan.produtos` (cópia congelada) → campo
   volta vazio ao chegar nota nova/trocar seleção/tick de 1s. A linha copiada
   continua correta (lê da tabela). (skip em `viewer.ui.test.js`)
3. **`atob` quebra UTF-8** na API primária: `<xProd>` com acento chega como "Ã‡..."
   no painel, enquanto o fallback (string pura) fica certo → painel diverge conforme
   a API usada. (skip em `viewer.api.test.js`)
4. **OCR aceita janela errada**: `text.match(/\d{44}/)` pega os primeiros 44 dígitos
   do texto limpo → um dígito de ruído antes da chave troca a chave lida.
   (skip em `phone.ocr.test.js`)

## Riscos / inconsistências a decidir na refac
- Comentário diz "timeout de 30 segundos", código usa `15000` (15s) — alinhar.
- Chave lida é **sem validação de DV**: só o CNPJ da chave é verificado.
- PeerIDs fixos (`phone-ocr`) — **RESOLVIDO**: cada sessão agora usa PIN aleatório
  de 6 dígitos como PeerID (ver item "Conexão por PIN" em Feito).
- `limparXML(null)` lança (só `undefined` usa o default); hoje não acontece em produção.
- Tratamento de erro por mensagem de texto (frágil): se a refac mudar a mensagem,
  ajuste os testes junto — eles são o contrato visível.

## Learnings (prontos para a refac)
- CNPJ = `chave.slice(6,20)`; nNF = `chave.slice(25,34)` com zeros removidos.
- Chave do README (`352605...9656`, CNPJ `03157268000200`) é válida — fixture real.
- Ordem das rotas de fetch importa: `/api/nfe/fallback/` casa também com `/api/nfe/`.
- Objetos vindos do jsdom têm prototype de outro realm → clonar no teste
  (`{...obj}` / `Array.from`) antes de `assert.deepEqual`.
- `Date.now()` continua real no relógio fake: só timers entram no tempo virtual.

## Learnings da refac (prontos para os próximos passos)
- Contrato dos testes fixa a estrutura: `viewer.js` é eval inteiro no jsdom (17 funções +
  5 estados `let` top-level com esses NOMES exatos); phone.html usa o 1º `<script>` inline;
  api.py é `import` com `main()`/`api.time` mockáveis.
- `tests/sanity.py` muta a **primeira ocorrência** do literal alvo: nunca escrever esses
  literais em comentários/texto (custou um FALHA DA SANIDADE que a suíte não pegou).
  Literais que precisam aparecer 1x: os 6 de viewer.js, `text.match(/\d{44}/)` em
  phone.html, `http_method == "PUT"` em api.py.
- Modularização real adotada: `src/` com módulos por arquivo (scripts puros, sem
  import/export — módulos ESM/bundler quebrariam o eval do harness e o sanity) +
  `tools/build.js` concatenando nos artefatos e validando os literais do contrato
  no próprio build (falha alto). `tools/build.js` é a lista de ordem dos módulos.
