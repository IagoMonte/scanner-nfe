// ============================================================================
// src/viewer/config.js — constantes de serviços e timings
//
// O prazo de auto-exclusão de card de erro usa o literal completo no ponto de
// uso (em domain.js): tests/sanity.py depende desse trecho exato para validar
// a suíte (não extrair constante nem mover para outro módulo).
// ============================================================================

const API_NFE_URL = '/api/nfe/';
const API_NFE_FALLBACK_URL = '/api/nfe/fallback/';
const API_RECEITA_URL = '/receita/v1/cnpj/';

const TIMEOUT_CONSULTA_MS = 15000;        // teto da API primária antes de cair no fallback
const INTERVALO_ENTRE_NOTAS_MS = 1000;    // ritmo anti-429 entre consultas
const TTL_CARD_ERRO_MS = 15000;           // vida de um card de erro (timer de remoção)
const TIMEOUT_CONEXAO_MS = 15000;         // prazo para o canal com o celular abrir
const RECONEXAO_MS = 3000;                // espera antes de voltar ao servidor de sinalização

const TEXTO_ESTADO_VAZIO = 'As notas recebidas aparecem na lista lateral. Ao selecionar uma, o card completo abre aqui.';
