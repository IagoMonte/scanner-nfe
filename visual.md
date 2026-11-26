# visual.md — fonte da verdade da UI

## Viewer (`viewer.html` ← `src/viewer`)

### Cores (`:root`)
| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#07110b` | fundo |
| `--surface` / `--surface-2` / `--surface-3` | `#0d1812` / `#132119` / `#182a20` | painéis/cards |
| `--border` | `rgba(255,255,255,.08)` | bordas |
| `--text` | `#eaf6ee` | texto |
| `--muted` | `#9fb5a5` | texto secundário |
| `--green` / `--green-2` | `#22c55e` / `#16a34a` | ações positivas, estados ok |
| `--red` / `--red-2` | `#ef4444` / `#b91c1c` | erros, reset |
| `--amber` | `#f59e0b` | loading |

- Fundo do body: gradientes radiais verde/vermelho sutis sobre `#08100b → #050806`.
- Sombras: `var(--shadow: 0 14px 40px rgba(0,0,0,.35))`.
- Painéis: `linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02))` sobre `--surface`.
- Pills/tags: fundo verde vermelho/âmbar a ~10–12% de opacidade, borda ~22–28%, texto claro esverdeado/avermelhado.
- Inputs: fundo `#0b130f`, borda `rgba(255,255,255,.08)`, radius 12px; foco: borda `rgba(34,197,94,.48)` + ring `rgba(34,197,94,.12)`.
- Botão primário (copiar): gradiente verde, texto `#d6ffe4`, radius 12px, peso 800.
- Radius: painéis 18–22px, itens 12–16px, pills 999px.

### Tipografia
- **Satoshi** (Google Fontshare), fallback `system-ui`.
- h1 ~1.05rem (700/900), corpo `.92rem`, labels uppercase `.7–.78rem` com tracking.

## Phone (`phone.html` ← `src/phone`)

Mesma linguagem do viewer: **mesmos tokens, Satoshi, fundo com radiais verde/vermelho, painéis e logo "NF"**.
CSS próprio inline (sem Tailwind); os tokens são repetidos no `:root` do phone.

- Layout: coluna única, `max-width: 520px`, `gap: 12px`, na ordem: cabeçalho + status → PIN → câmera → recorte e última leitura → botão.
- **Status pill** igual à do viewer, com cor por estado em `data-tipo`: `ok` verde (câmera pronta, viewer conectado, chave enviada), `wait` âmbar (iniciando câmera, lendo chave), `err` vermelho (erro de câmera/OCR, faltando dígitos). Texto e tom mudam juntos via `definirStatus()`.
- PIN: painel com borda verde `.26`, número `2.4rem` peso 900, tracking `.3em`, fundo de input `#0b130f`.
- Câmera: largura 100%, `max-height: 36dvh` com `object-fit: cover`.
- Mira (`#alvo`): centralizada, com **o tamanho exato do recorte do OCR** (92% × 90px do vídeo, convertidos para a tela por `ajustarMira()`; é uma faixa fina). Contorno verde por fora (`outline`), pulsante (parado com `prefers-reduced-motion`), fora dela escurecido. Nada desenhado sobre a área lida; a instrução fica no cabeçalho.
- Estados de conexão: "conectando viewer..." (wait), "viewer conectado" e "conexão restabelecida" (ok), "viewer desconectado", "chave não enviada" e "erro de conexão" (err).
- Botão "Capturar chave": gradiente verde do botão primário, texto `#06210f`, peso 900, **fixo no rodapé** (`sticky`, respeita `safe-area-inset-bottom`).
- Telas baixas (`max-height: 700px`): topo compacto, sem o texto de apoio do PIN. Até `500px` (deitado): câmera antes do cabeçalho.

## Modal do PIN (viewer) — spec

- Overlay: `position: fixed; inset: 0; display: grid; place-items: center; z-index alto.`,
  fundo `rgba(5,8,6,.55)` + **`backdrop-filter: blur(10px)`** (com `-webkit-`) para esconder o fundo.
- Card: mesma receita dos painéis (gradiente de surface + borda `--border` + `--shadow` + radius 22px), largura `min(360px, 92vw)`.
- Conteúdo: título, subtítulo em `--muted`, input centralizado do PIN (font-size grande, peso 900, letter-spacing largo, estilo de input do tema), botão primário verde de 12px radius, caixa de erro vermelha (mesma receita de `.error-box`), link discreto "ou buscar chave manualmente".
- Segurança: sem botão fechar. O modal sai ao tentar conectar com PIN válido ou ao pular para a busca manual, e volta se o celular não for encontrado ou a conexão for encerrada. O pular (link) **não toca no peer** — só esconde o modal e foca o campo; status segue "conectando...".
- Erros em vermelho dentro do modal: PIN fora do formato (6 dígitos numéricos), painel ainda sem ligação com o servidor, `peer-unavailable` (PIN errado/celular ausente), sem resposta em 15s e conexão encerrada (nos dois últimos o status vira "desconectado").

## Busca manual de chave (viewer) — spec

- Local: topo do painel **Notas** (`.list-panel`), entre o cabeçalho e a lista de cards — o resultado (card novo) nasce no mesmo painel, perto do campo.
- Layout: grid `gap: 8px`, **input em uma linha (largura total)** e botão "Buscar" abaixo em largura total — os 44 dígitos precisam caber sem scroll no painel de 330px.
- Input: receita do tema (fundo `#0b130f`, borda `rgba(255,255,255,.08)`, radius 12px, foco verde) com `font-size: .65rem` e padding horizontal 10px para os 44 dígitos caberem sem scroll no painel de 330px (container com 10px lateral, alinhado aos cards); `inputmode="numeric"`.
- Botão "Buscar": mesma receita do botão primário (gradiente verde, texto `#d6ffe4`, radius 12px, peso 800, hover com `brightness(1.08)`).
- Erro inline: `<p>` reusando a classe **`.error-box`** existente (zero CSS novo), `hidden` por padrão. Mensagens: formato → `A chave deve ter 44 dígitos.`; duplicata → `Chave já está na lista.`
- `.list-panel` passa a `grid-template-rows: auto auto 1fr` (cabeçalho + busca + lista); `.detail-panel` inalterado.
- Link do modal: sem borda/fundo, `--muted`, sublinhado, `.86rem`, `cursor: pointer`; hover clareia para `--text`.

## Downloads da nota (viewer) — spec

- Local: card de nota válida, entre os dados (CNPJ/NF/Fornecedor) e os produtos.
- `.doc-actions`: grid de 2 colunas iguais, `gap: 8px`.
- Botões "Baixar XML" e "Baixar PDF": receita do botão primário (`.copy-btn`), `min-height: 44px`, hover com `brightness(1.08)`.
- Sem o arquivo: botão desabilitado (`opacity: .45`, `cursor: not-allowed`) com `title` "PDF não disponível".
- Cards em leitura ou com erro não têm os botões.

## Regras gerais
- Nada de universos visuais novos: reusar paleta/borda/radius existentes de cada lado.
- Códigos de status em `pt-BR`, minúsculas, como já usados.
