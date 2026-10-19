'use strict';

/**
 * Fixtures reais: chaves de acesso de 44 dígitos montadas no layout da NF-e
 * (cUF 2 + AAMM 4 + CNPJ 14 + mod 2 + série 3 + nNF 9 + tpEmis 1 + cNF 8 + DV 1).
 * A primeira é a chave de exemplo do README — CNPJ de fato válido (03.157.268/0002-00).
 */

const CHAVE_UMA = '35260503157268000200550010001330001808239656';
const CNPJ_UMA = '03157268000200';
const NF_UMA = '133000';

const CHAVE_DUAS = '43260111222333000181550010000042051000000779';
const CNPJ_DUAS = '11222333000181';
const NF_DUAS = '4205';

const CHAVE_TRES = '31251211222333000181550000000999991000001234';
const NF_TRES = '99999';

/** 44 dígitos com CNPJ zerado: nunca passa na verificação de dígito. */
const CHAVE_CNPJ_INVALIDO = '0'.repeat(44);

const FORNECEDOR = 'Distribuidora Exemplo Ltda';

const PRODUTOS_PADRAO = [
  { nome: 'REAGENTE QUIMICO 500ML', quantidade: '10.0000', unidade: 'UN' },
  { nome: 'LUVA NITRILICA P', quantidade: '24.0000', unidade: 'CX' },
];

function xmlNota(produtos = PRODUTOS_PADRAO) {
  const dets = produtos
    .map(
      (p) => `<det nItem="1"><prod>`
        + `<xProd>${p.nome}</xProd>`
        + `<qCom>${p.quantidade}</qCom>`
        + `<uCom>${p.unidade}</uCom>`
        + `</prod></det>`
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00"><NFe><infNFe><ide><mod>55</mod></ide>${dets}</infNFe></NFe></nfeProc>`;
}

function base64(xml) {
  return Buffer.from(xml, 'utf8').toString('base64');
}

/** Resposta da API primária (POST /api/nfe/). */
function respostaPrimaria(xml) {
  return { status: 'ok', xml_base64: base64(xml) };
}

/** Resposta do fallback (GET /api/nfe/fallback/{chave}). */
function respostaFallback(xml) {
  return { xmlCode: xml };
}

module.exports = {
  CHAVE_UMA,
  CNPJ_UMA,
  NF_UMA,
  CHAVE_DUAS,
  CNPJ_DUAS,
  NF_DUAS,
  CHAVE_TRES,
  NF_TRES,
  CHAVE_CNPJ_INVALIDO,
  FORNECEDOR,
  PRODUTOS_PADRAO,
  xmlNota,
  base64,
  respostaPrimaria,
  respostaFallback,
};
