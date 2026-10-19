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

- Tailwind (CDN), dark: `bg-black text-white`.
- Superfícies: `bg-zinc-900 border border-zinc-700/-800 rounded-2xl/3xl`.
- Destaques de ação/estado: **emerald-400** (sólido com texto preto) e `emerald-300` (texto).
- Tipografia: system-ui via Tailwind, títulos `font-bold text-3xl`, botão `text-xl font-bold py-5 rounded-2xl`.

## Modal do PIN (viewer) — spec

- Overlay: `position: fixed; inset: 0; display: grid; place-items: center; z-index alto.`,
  fundo `rgba(5,8,6,.55)` + **`backdrop-filter: blur(10px)`** (com `-webkit-`) para esconder o fundo.
- Card: mesma receita dos painéis (gradiente de surface + borda `--border` + `--shadow` + radius 22px), largura `min(360px, 92vw)`.
- Conteúdo: título, subtítulo em `--muted`, input centralizado do PIN (font-size grande, peso 900, letter-spacing largo, estilo de input do tema), botão primário verde de 12px radius, caixa de erro vermelha (mesma receita de `.error-box`).
- Segurança: modal **bloqueado** até conectar (sem botão fechar) — não há nada a fazer sem conexão.
- Erros: PIN fora do formato (6 dígitos numéricos) e `peer-unavailable` (PIN errado/celular ausente) exibidos em vermelho dentro do modal; modal volta a ficar visível no `peer-unavailable`.

## Regras gerais
- Nada de universos visuais novos: reusar paleta/borda/radius existentes de cada lado.
- Códigos de status em `pt-BR`, minúsculas, como já usados.
