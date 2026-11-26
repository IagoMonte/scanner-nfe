// ============================================================================
// src/viewer/utils.js — CNPJ, XML, datas, status e linha de planilha
// ============================================================================

function validarCNPJ(cnpj) {
  const limpo = String(cnpj || '').replace(/\D/g, '');
  if (limpo.length !== 14 || /^(\d)\1{13}$/.test(limpo)) return false;

  const calcularDigito = (base, pesos) => {
    const soma = base.split('').reduce((acc, digito, index) => acc + Number(digito) * pesos[index], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const base = limpo.slice(0, 12);
  const dig1 = calcularDigito(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dig2 = calcularDigito(base + dig1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return limpo === `${base}${dig1}${dig2}`;
}


/** Todo texto de fora (nota, consulta, celular) passa por aqui antes de virar HTML. */
function escaparHTML(valor) {
  const entidades = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(valor ?? '').replace(/[&<>"']/g, (c) => entidades[c]);
}


function chaveValida(chave) {
  return typeof chave === 'string' && /^\d{44}$/.test(chave);
}


function limparXML(valor = '') {
  return valor
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}


function formatarData(data) {
  if (!data) return '';
  const dataLimpa = data.split('T')[0];
  const [ano, mes, dia] = dataLimpa.split('-');
  return `${dia}/${mes}/${ano}`;
}


function gerarId() {
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}


function getStatusClass(tipo) {
  if (tipo === 'success') return 'ok';
  if (tipo === 'error') return 'err';
  return 'wait';
}


function getStatusLabel(tipo) {
  if (tipo === 'success') return 'Válido';
  if (tipo === 'error') return 'Erro';
  return 'Lendo';
}


/** Segundos restantes do card de erro, ou null quando não há exclusão agendada. */
function segundosAteApagar(scan) {
  if (!scan.deleteAt) return null;
  return Math.max(0, Math.ceil((scan.deleteAt - Date.now()) / 1000));
}


/** Arquivo a partir de base64; null quando a consulta não trouxe um conteúdo legível. */
function base64ParaBlob(base64, tipo) {
  if (typeof base64 !== 'string' || !base64) return null;
  try {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return new Blob([bytes], { type: tipo });
  } catch {
    return null;
  }
}


function baixarArquivo(blob, nome) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  link.click();
  // revogar no mesmo instante pode cancelar o download em alguns navegadores
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


/** Linha no formato tab-separado esperado pelo Excel (ordem das colunas fixa). */
function montarLinhaPlanilha(item) {
  const quantidade = [item.quantidade, item.unidade].filter(Boolean).join(' ');
  return [
    item.key,
    item.produto,
    item.dataRecebimento,
    quantidade,
    item.fornecedor,
    formatarData(item.fabricacao),
    item.validadeMeses ? `${item.validadeMeses} meses` : '',
    item.notaFiscal
  ].join('\t');
}
