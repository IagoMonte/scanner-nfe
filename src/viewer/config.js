// ============================================================================
// src/viewer/config.js — constantes de serviços e timings
//
// O prazo de auto-exclusão de card de erro usa o literal completo no ponto de
// uso (em domain.js): tests/sanity.py depende desse trecho exato para validar
// a suíte (não extrair constante nem mover para outro módulo).
// ============================================================================

const API_NFE_URL = 'https://dtgames.myddns.me/api/nfe/';
const API_NFE_FALLBACK_URL = 'https://dtgames.myddns.me/api/nfe/fallback/';
const API_RECEITA_URL = 'https://dtgames.myddns.me/receita/v1/cnpj/';

const TIMEOUT_CONSULTA_MS = 15000;        // teto da API primária antes de cair no fallback
const INTERVALO_ENTRE_NOTAS_MS = 1000;    // ritmo anti-429 entre consultas
const TTL_CARD_ERRO_MS = 15000;           // vida de um card de erro (timer de remoção)

const TEXTO_ESTADO_VAZIO = 'As notas recebidas aparecem na lista lateral. Ao selecionar uma, o card completo abre aqui.';
