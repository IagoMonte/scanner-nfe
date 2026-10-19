#!/usr/bin/env node
// ============================================================================
// tools/build.js — gera os artefatos a partir de src/, sem dependências.
//
// Artefatos (versionados, servidos em produção):
//   viewer.js   ← concatenação de src/viewer/*.js na ordem abaixo
//   phone.html  ← src/phone/index.html com {{SCRIPT}} = src/phone/script.js
//
// Por que concatenação e não import/export?
//   A suíte de testes (tests/helpers/harness.js) faz eval do viewer.js inteiro
//   e extrai o 1º <script> inline do phone.html como está — módulos/empacotador
//   quebrariam esse contrato, e um bundler quebraria tests/sanity.py (muta o
//   artefato e roda os testes sem rebuild). Concatenar é o KISS possível aqui:
//   módulos reais em arquivos, virando um único script no escopo top-level.
//
// Regras de contrato validadas aqui (falha alto se quebrarem):
//   - nomes/estado top-level exigidos pelo harness (declaração de função/let solta);
//   - literais mutados pelo sanity, cada um aparecendo EXATAMENTE 1x no artefato
//     (a mutação troca só a 1ª ocorrência — nunca colocar esses trechos em
//     comentários ou strings).
// ============================================================================

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const MODULOS_VIEWER = [
  'config', // constantes de serviços e timings
  'dom',    // referências aos elementos da página
  'state',  // dados mutáveis do app
  'utils',  // CNPJ, XML, datas, status e linha de planilha
  'api',    // consulta do XML (primária + fallback) e do CNPJ
  'domain', // ciclo de vida do scan e da linha da planilha
  'render', // montagem dos cards e atualização da tela
  'events', // listeners de clique, input, reset e tick do relógio
  'boot',   // conexão PeerJS com o celular
];

/** Literais com os quais a suíte de mutação (tests/sanity.py) trabalha. */
const LITERAIS_PINADOS = [
  'chave.slice(6, 20)',
  'chave.slice(25, 34)',
  "].join('\\t')",
  'if (jaExiste) {',
  'Date.now() + 15000',
  'if (!fornecedor) {',
];

const ler = (rel) => {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.error(`FALHA DO BUILD: fonte não encontrada: ${rel}`);
    process.exit(1);
  }
  return fs.readFileSync(abs, 'utf8');
};

function falharPorLiteral(artefato, literal, ocorrencias) {
  console.error(
    `FALHA DO BUILD: literal do contrato de testes deve aparecer exatamente 1x ` +
    `mas apareceu ${ocorrencias}x em ${artefato}: ${literal}`
  );
  process.exit(1);
}

function conferirLiterais(artefato, texto) {
  for (const literal of LITERAIS_PINADOS) {
    const ocorrencias = texto.split(literal).length - 1;
    if (ocorrencias !== 1) falharPorLiteral(artefato, literal, ocorrencias);
  }
}

// ---- viewer.js ---------------------------------------------------------------

const secoes = MODULOS_VIEWER
  .map((nome) => `src/viewer/${nome}.js`)
  .map((rel) => `// ===== ${rel} =====\n${ler(rel).trim()}\n`);

const viewerJs = `// GERADO POR tools/build.js — NÃO EDITAR A MÃO: fonte em src/viewer/\n\n${secoes.join('\n')}`;

fs.writeFileSync(path.join(ROOT, 'viewer.js'), viewerJs);
conferirLiterais('viewer.js', viewerJs);

// ---- phone.html ---------------------------------------------------------------

const template = ler('src/phone/index.html');
const script = ler('src/phone/script.js');

if (!template.includes('{{SCRIPT}}')) {
  console.error('FALHA DO BUILD: placeholder {{SCRIPT}} não encontrado em src/phone/index.html');
  process.exit(1);
}

const phoneHtml = template.replace('{{SCRIPT}}', script.trim());
fs.writeFileSync(path.join(ROOT, 'phone.html'), phoneHtml);

if (!/<script>\s*\S/.test(phoneHtml)) {
  console.error('FALHA DO BUILD: 1º <script> inline do phone.html não contém o script do cellular');
  process.exit(1);
}

const literalOcr = 'text.match(/\\d{44}/)';
const ocorrenciasOcr = phoneHtml.split(literalOcr).length - 1;
if (ocorrenciasOcr !== 1) falharPorLiteral('phone.html', literalOcr, ocorrenciasOcr);

console.log('build ok: viewer.js (9 módulos) e phone.html gerados a partir de src/');
