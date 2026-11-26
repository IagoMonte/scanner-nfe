# Changelog

O projeto vinha de um servidor próprio e entrou no git em outubro de 2026.

## 2026-11-26

- **Download da nota** — botões para baixar o XML e o PDF (DANFE) no cartão de
  cada nota válida.
- **Celular redesenhado** — mesma identidade do painel, status colorido por estado,
  botão fixo no rodapé e CSS próprio no lugar do Tailwind.
- **Área verde fiel ao OCR** — a faixa na tela passa a ter o tamanho do recorte lido.
- **Reforço de segurança** — dados externos escapados, um painel por celular, proxy
  restrito e verificação de integridade nos scripts das páginas.
- **Quedas de conexão** — prazo para conectar, detecção de queda abrupta e
  reconexão ao servidor de sinalização, no celular e no painel.
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
