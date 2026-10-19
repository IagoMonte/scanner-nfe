// ============================================================================
// src/viewer/api.js — consulta do XML da nota (primária + fallback) e do CNPJ
// ============================================================================

/** API primária: devolve o XML em base64 (timeout e erro acionam o fallback). */
async function obterXMLPrimaria(chaveacesso) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_CONSULTA_MS);

  try {
    const resposta = await fetch(API_NFE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chave: chaveacesso }),
      signal: controller.signal
    });

    if (!resposta.ok) {
      throw new Error(`HTTP ${resposta.status}`);
    }

    const jsonRes = await resposta.json();
    if (jsonRes.status !== 'ok' || !jsonRes.xml_base64) {
      throw new Error('Resposta inválida da API primária.');
    }

    return atob(jsonRes.xml_base64);
  } finally {
    clearTimeout(timeoutId);
  }
}


/** Fallback proxyado (mesma origem): devolve o XML puro dentro de "xmlCode". */
async function obterXMLFallback(chaveacesso) {
  const fallbackRes = await fetch(`${API_NFE_FALLBACK_URL}${chaveacesso}`, {
    method: 'GET'
  });

  if (!fallbackRes.ok) {
    throw new Error(`Falha no fallback: HTTP ${fallbackRes.status}`);
  }

  const fallbackData = await fallbackRes.json();
  if (fallbackData && fallbackData.xmlCode) {
    return fallbackData.xmlCode;
  }

  throw new Error('Estrutura de resposta do fallback não contém xmlCode.');
}


/** Parseia o XML da NF-e e extrai nome/quantidade/unidade de cada produto. */
function extrairProdutosDoXML(xmlString) {
  const xmlDoc = new DOMParser().parseFromString(xmlString, 'text/xml');
  const parseError = xmlDoc.querySelector('parsererror');
  if (parseError) {
    throw new Error('XML inválido retornado pela API.');
  }

  const xProdNodes = xmlDoc.getElementsByTagName('xProd');
  const qComNodes = xmlDoc.getElementsByTagName('qCom');
  const uComNodes = xmlDoc.getElementsByTagName('uCom');

  const produtos = [];

  for (let i = 0; i < xProdNodes.length; i++) {
    const nome = limparXML(xProdNodes[i].textContent);
    const quantidade = qComNodes[i] ? limparXML(qComNodes[i].textContent) : '';
    const unidade = uComNodes[i] ? limparXML(uComNodes[i].textContent) : '';

    if (nome) {
      produtos.push({
        nome,
        quantidade,
        unidade,
        fabricacao: '',
        validadeMeses: ''
      });
    }
  }

  return produtos;
}


/** Consulta primária + fallback e parser do XML até chegar na lista de produtos. */
async function produtosbyxml(chaveacesso) {
  let xmlString;

  try {
    xmlString = await obterXMLPrimaria(chaveacesso);
  } catch (error) {
    console.warn('Falha ou timeout na API primária, acionando fallback...', error.message);
    xmlString = await obterXMLFallback(chaveacesso);
  }

  const produtos = extrairProdutosDoXML(xmlString);

  if (produtos.length === 0) {
    throw new Error('Nenhum produto encontrado no XML.');
  }

  return produtos;
}


async function buscarFornecedor(cnpj) {
  const resposta = await fetch(`${API_RECEITA_URL}${cnpj}`);
  const dados = await resposta.json();
  return dados?.nome || '';
}
