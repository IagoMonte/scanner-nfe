# Changelog

Histórico do repositório (5 commits, todos em 2026-10-19 — o projeto vinha de um
servidor CloudPanel e entrou no git nessa data).

## 2026-10-19

- **Importa Scanner NF-e do cloudpanel (primeira versão no git)** — app do
  celular com OCR, painel do desktop com consulta de nota e proxy Nginx.
- **Suíte de testes automática + refatoração interna modular (KISS)** — jsdom
  cobrindo o fluxo de ponta a ponta sem reescrever a lógica, `sanity.py` com
  mutações induzidas, `api.py` testado por CLI.
- **Projeto Node modular de verdade: fonte em `src/` + build zero-dep** —
  módulos por responsabilidade em `src/viewer/` e `src/phone/`, `tools/build.js`
  gerando `viewer.js` e `phone.html` com validação do contrato da suíte.
- **Conexão por PIN** — o celular gera o PeerID de 6 dígitos e o exibe; o viewer
  conecta só pelo modal com blur. Elimina o PeerID fixo compartilhado.
- **Busca manual de chave no viewer** — chave digitada no painel, sem celular,
  entrando no mesmo pipeline de consulta e deduplicação.

## Pendências (fora do versionado)

- 4 bugs conhecidos com `test.skip` intencional (não apagar — cada `skip` vira
  teste ativo quando o bug for corrigido).
- `401` no fallback do XML em produção; API primária respondendo `400`.
