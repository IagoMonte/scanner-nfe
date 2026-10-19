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

## Arquivos

| Arquivo | Papel |
|---|---|
| `phone.html` | App do celular: câmera + OCR (Tesseract.js) + envio via PeerJS |
| `viewer.html` | Painel do desktop (marcação + estilos) |
| `viewer.js` | Lógica do painel: recebe chaves, consulta APIs, renderiza notas |
| `api.py` | Script auxiliar: consulta o meudanfe.com.br via chromedriver |
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
Os dois se conectam automaticamente pelo PeerJS (id fixo `phone-ocr`).

> **Atenção:** os PeerIDs são fixos (`phone-ocr`). Se você hospedar publicamente,
> considere torná-los únicos/aleatórios para evitar que outra pessoa conecte no
> mesmo canal.

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
