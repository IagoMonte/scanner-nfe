# Changelog

O projeto vinha de um servidor próprio e entrou no git em outubro de 2026.

## 2026-11-26

- **Celular redesenhado** — mesma identidade do painel, status colorido por estado,
  mira alinhada ao recorte, botão fixo no rodapé e CSS próprio no lugar do Tailwind.
- **Preparação para publicação** — endereços de servidor removidos do
  histórico inteiro e consultas passando a usar caminhos relativos.

## 2026-10-19

- **Primeira versão no git** — app do celular com OCR, painel de consulta e proxy
  Nginx.
- **Suíte de testes e refatoração modular** — testes em jsdom, teste de mutação e
  `api.py` testado por linha de comando.
- **Projeto modular** — fonte em `src/` e build sem dependências.
- **Conexão por PIN** — fim do identificador fixo compartilhado.
- **Busca manual de chave** — consulta sem celular, no mesmo fluxo das leituras.
