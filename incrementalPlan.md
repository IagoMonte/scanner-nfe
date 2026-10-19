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

## Próxima tarefa
1. Corrigir os 4 bugs marcados com `test.skip` e desativar os skips (agora em `src/`).

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
- PeerIDs fixos (`phone-ocr`) — já documentado no README.
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
