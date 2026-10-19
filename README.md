# Scanner NF-e

Scanner de nota fiscal (NF-e) que usa a **câmera do celular** para ler a chave de
acesso via OCR e exibe os dados da nota em um **painel web** (fornecedor, produtos,
fabricação e validade), com exportação da linha no formato de planilha.

Feito para o fluxo de recebimento de mercadoria: aponta o celular para a chave da
NF-e, a chave é lida e a nota aparece no painel para conferência.

## Como funciona

O sistema tem duas páginas que se comunicam **P2P via PeerJS**:

```
┌─────────────────┐   PeerJS (P2P)   ┌──────────────────────┐
│   phone.html    │ ────────────────▶ │     viewer.html      │
│ (no celular)    │  chave + imagem   │ (painel no desktop)  │
│  OCR da chave   │                   │ consulta APIs da NF-e│
└─────────────────┘                   └──────────────────────┘
```

1. **`phone.html`** — abre no celular, acessa a câmera, recorta a área da chave e
   usa **Tesseract.js** para extrair os 44 dígitos da chave de acesso.
2. **`viewer.html` + `viewer.js`** — abre no desktop, recebe a chave via PeerJS,
   valida o CNPJ embutido na chave e consulta:
   - **Produtos** da nota (via proxy Nginx → API de consulta de DANFE);
   - **Nome do fornecedor** (via proxy Nginx → ReceitaWS).
3. Para cada produto, o painel permite preencher **fabricação** e **validade (meses)**
   e gerar uma linha copiável no formato de planilha (separada por tab).

## Estrutura do projeto (modular)

O código-fonte vive em `src/`, organizado em módulos de arquivo único por
responsabilidade. `tools/build.js` (sem dependências) gera os artefatos que o
navegador e os testes consomem — `viewer.js` e `phone.html` são **gerados, não
editar a mão** (o `api.py` fica em arquivo único Python, sem build).

```
src/viewer/          painel, um arquivo por responsabilidade:
  config.js            URLs das APIs e timings
  dom.js               referências aos elementos da página
  state.js             dados mutáveis do app
  utils.js             CNPJ, XML, datas, status, linha da planilha
  api.js               consulta do XML (primária + fallback) e do CNPJ
  domain.js            ciclo de vida do scan e da planilha
  render.js            montagem dos cards e da tela
  events.js            listeners (clique, input, reset, relógio)
  boot.js              conexão PeerJS com o celular
src/phone/
  script.js            lógica do celular (câmera, recorte, OCR, envio)
  index.html           marcação da página (template com {{SCRIPT}})
tools/build.js       gera viewer.js e phone.html a partir de src/
```

```bash
npm run build    # regenera viewer.js e phone.html (valida o contrato da suíte)
npm test         # build + suíte JS
```

Os artefatos são mantidos versionados porque a hospedagem é estática (ver
`deploy/`). O build falha alto se os nomes/literais que os testes consomem
(`tests/helpers/harness.js` e `tests/sanity.py`) estiverem fora do contrato.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/` | Código-fonte modular (o que você edita) |
| `phone.html` | **Gerado**: app do celular (câmera + OCR + envio via PeerJS) |
| `viewer.html` | Painel do desktop (marcação + estilos) |
| `viewer.js` | **Gerado**: lógica do painel (recebe chaves, consulta APIs, renderiza) |
| `api.py` | Script auxiliar: consulta o meudanfe.com.br via chromedriver |
| `tools/build.js` | Build zero-deps: concatena `src/` nos artefatos |
| `deploy/` | Config do Nginx e instruções de implantação |

## Rodando localmente

Como as páginas usam `getUserMedia` (câmera) e conexões P2P, é preciso servir por
HTTP**S** (ou `localhost`, que é tratado como contexto seguro):

```bash
# qualquer servidor estático, por exemplo:
python3 -m http.server 8080
# ou
npx serve .
```

Abra `viewer.html` no desktop e `phone.html` no celular (mesmo domínio/porta).
O celular gera um **PIN de 6 dígitos** (que é o PeerID da sessão) e o exibe na
tela; no desktop, digite esse PIN no modal e clique **Conectar**. Sem o PIN,
nenhuma conexão acontece — cada celular só aceita quem souber o seu PIN.

## Testes

A suíte cobre a lógica de ponta a ponta **sem reescrever nada**: os testes
carregam `viewer.html`, `viewer.js` e o script do `phone.html` reais dentro de um
jsdom, controlando só as fronteiras externas (PeerJS, `fetch` das APIs,
clipboard e relógio). Serve de rede de segurança para a refatoração.

```bash
npm install                 # só jsdom (dev)
npm test                    # node:test  → viewer + celular
npm run test:py             # unittest   → api.py
python3 tests/sanity.py     # quebra o código de propósito e exige que os testes falhem
```

| Arquivo | O que valida |
|---|---|
| `tests/viewer.core.test.js` | CNPJ, limpeza de XML, datas, layout da chave de 44 dígitos |
| `tests/viewer.api.test.js` | produtos do XML, fallback, timeout de 15s, fornecedor |
| `tests/viewer.scan.test.js` | processamento, deduplicação, erros, limpeza/reset |
| `tests/viewer.queue.test.js` | fila de 1s entre consultas e auto-exclusão de 15s |
| `tests/viewer.ui.test.js` | cards por estado, seleção, inputs e a linha da planilha |
| `tests/viewer.manual.test.js` | busca manual da chave (formato, duplicata, sem celular) |
| `tests/phone.ocr.test.js` | câmera, recorte da área verde, extração da chave, envio |
| `tests/test_api_cli.py` | validação de CLI e filtro CDP do `api.py` |

Quatro testes ficam **`skip` de propósito**: codificam a intenção de bugs já
conhecidos que a refatoração precisa corrigir (ver `incrementalPlan.md`).
Não apague — desative o `skip` quando o bug for corrigido.

## APIs consumidas (via proxy Nginx)

O `viewer.js` chama os endpoints abaixo, todos resolvidos pelo Nginx (ver `deploy/`):

| Caminho local | Destino remoto | Uso |
|---|---|---|
| `POST /api/nfe/` | `consultadanfe.com/api/v1/consulta` | XML da nota (produtos) |
| `GET /api/nfe/fallback/{chave}` | `api.danferapida.com.br/...` | Fallback do XML |
| `GET /receita/v1/cnpj/{cnpj}` | `receitaws.com.br` | Nome do fornecedor |
| `GET /danfe/...` | `ws.meudanfe.com.br` | Consulta DANFE (usada pelo `api.py`) |

> Os domínios `dtgames.myddns.me` estão **hardcoded** no `viewer.js`. Para rodar
> em outro host, ajuste as constantes no topo de `produtosbyxml` e `buscarFornecedor`.

## api.py

Script independente que automatiza o meudanfe.com.br com `undetected_chromedriver`:

```bash
pip install undetected-chromedriver selenium
python api.py <chave_de_acesso_44_digitos>
```

Imprime no stdout a resposta do DANFE para a chave informada.

## Implantação

O Nginx do CloudPanel serve os arquivos estáticos e faz o proxy das APIs.
O config de referência está em `deploy/dtgames.myddns.me.conf`.

A API key do fallback (danferapida) **não** fica no config versionado — ver
`deploy/secrets/danferapida.key.conf.example`.

## Stack

- **Front:** HTML, CSS, JavaScript puro (sem build)
- **OCR:** Tesseract.js
- **P2P:** PeerJS
- **UI:** Tailwind CDN (phone) + CSS custom (viewer)
- **Aux:** Python + undetected-chromedriver
- **Servidor:** Nginx (proxy + estáticos)
