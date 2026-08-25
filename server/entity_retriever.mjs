const DEFAULT_RRF_K = 60;

function text(value) {
  return String(value ?? '').normalize('NFKC').trim();
}

function tokens(value) {
  return text(value)
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function compactCard(card) {
  return {
    entity_id: text(card.entity_id),
    friendly_name: text(card.friendly_name) || text(card.entity_id),
    domain: text(card.domain),
    state: card.state ?? null,
    device_class: text(card.device_class) || null,
    area: text(card.area) || null,
    capabilities: Array.isArray(card.capabilities) ? card.capabilities : [],
    capability_attributes: card.capability_attributes && typeof card.capability_attributes === 'object'
      ? card.capability_attributes
      : {},
    supported_actions: Array.isArray(card.supported_actions) ? card.supported_actions : [],
  };
}

function eligibleCards(cards) {
  return (Array.isArray(cards) ? cards : [])
    .filter((card) => card?.entity_id && card?.domain)
    .filter((card) => (
      (Array.isArray(card.supported_actions) && card.supported_actions.length > 0)
      || text(card.device_class)
      || text(card.area)
      || Object.keys(card.capability_attributes || {}).length > 0
    ))
    .map(compactCard);
}

export function entityCardDocument(card) {
  return [
    `entity ${card.entity_id}`,
    `name ${card.friendly_name}`,
    `area ${card.area || ''}`,
    `domain ${card.domain}`,
    `device class ${card.device_class || ''}`,
    `services ${(card.supported_actions || []).join(' ')}`,
    `capabilities ${(card.capabilities || []).join(' ')}`,
  ].join('\n');
}

function lexicalScore(query, card, documentFrequency, documentCount) {
  const normalizedQuery = text(query).toLocaleLowerCase();
  const fields = [card.entity_id, card.friendly_name, card.area, card.domain, card.device_class]
    .map((value) => text(value).toLocaleLowerCase())
    .filter(Boolean);
  let score = 0;
  fields.forEach((field, index) => {
    if (normalizedQuery === field) score += 24 - index;
    else if (field.length > 1 && normalizedQuery.includes(field)) score += 12 - index;
  });
  const documentTokens = new Set(tokens(entityCardDocument(card)));
  for (const token of new Set(tokens(query))) {
    if (!documentTokens.has(token)) continue;
    const df = documentFrequency.get(token) || 0;
    score += Math.log(1 + ((documentCount - df + 0.5) / (df + 0.5)));
  }
  return score;
}

export function rankEntitiesLexically(query, cards) {
  const eligible = eligibleCards(cards);
  const documentFrequency = new Map();
  for (const card of eligible) {
    for (const token of new Set(tokens(entityCardDocument(card)))) {
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    }
  }
  return eligible
    .map((card) => ({ card, score: lexicalScore(query, card, documentFrequency, eligible.length) }))
    .sort((a, b) => b.score - a.score || a.card.entity_id.localeCompare(b.card.entity_id));
}

function diversifyRanking(ranking) {
  const selected = [];
  const seen = new Set();
  const add = (entry) => {
    if (!seen.has(entry.card.entity_id)) {
      selected.push(entry);
      seen.add(entry.card.entity_id);
    }
  };
  ranking.filter(({ score }) => score > 0).forEach(add);
  const seenDomains = new Set(selected.map(({ card }) => card.domain));
  for (const entry of ranking) {
    if (seenDomains.has(entry.card.domain)) continue;
    add(entry);
    seenDomains.add(entry.card.domain);
  }
  ranking.forEach(add);
  return selected;
}

function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || !left.length) return -1;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : -1;
}

export function reciprocalRankFusion(rankings, k = DEFAULT_RRF_K) {
  const scores = new Map();
  const cards = new Map();
  for (const ranking of rankings) {
    ranking.forEach((entry, index) => {
      const entityId = entry.card.entity_id;
      cards.set(entityId, entry.card);
      scores.set(entityId, (scores.get(entityId) || 0) + (1 / (k + index + 1)));
    });
  }
  return [...scores.entries()]
    .map(([entityId, score]) => ({ card: cards.get(entityId), score }))
    .sort((a, b) => b.score - a.score || a.card.entity_id.localeCompare(b.card.entity_id));
}

async function ollamaEmbeddings(inputs, options) {
  const env = options.env || process.env;
  const fetchImpl = options.embeddingFetchImpl || fetch;
  const baseUrl = text(env.OLLAMA_BASE_URL) || 'http://127.0.0.1:11434';
  const model = text(env.OLLAMA_EMBED_MODEL) || 'qwen3-embedding:0.6b';
  const timeout = Number.parseInt(String(env.LLM_EMBED_TIMEOUT_MS || ''), 10) || 30_000;
  const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: inputs, truncate: true, keep_alive: '30m' }),
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`Embedding request failed: ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body?.embeddings) || body.embeddings.length !== inputs.length) {
    throw new Error('Embedding response has an unexpected shape.');
  }
  return { embeddings: body.embeddings, model: text(body.model) || model };
}

export async function retrieveEntityContext(query, cards, options = {}) {
  const maxCards = Math.max(1, Number.parseInt(String(options.maxCards || ''), 10) || 32);
  const lexical = rankEntitiesLexically(query, cards);
  const diversifiedLexical = diversifyRanking(lexical);
  const mode = text(options.mode || options.env?.LLM_ENTITY_RETRIEVAL || process.env.LLM_ENTITY_RETRIEVAL || 'lexical')
    .toLocaleLowerCase();
  if (mode !== 'hybrid' || lexical.length < 2) {
    return { cards: diversifiedLexical.slice(0, maxCards).map(({ card }) => card), method: 'lexical', fallback: false };
  }

  try {
    const documents = lexical.map(({ card }) => entityCardDocument(card));
    const embed = options.embed || ((inputs) => ollamaEmbeddings(inputs, options));
    const instructedQuery = `Instruct: Retrieve Home Assistant entities matching the device, room, event, or state described by the home-automation request.\nQuery: ${text(query)}`;
    const { embeddings, model } = await embed([instructedQuery, ...documents]);
    const [queryEmbedding, ...documentEmbeddings] = embeddings;
    const dense = lexical
      .map(({ card }, index) => ({ card, score: cosineSimilarity(queryEmbedding, documentEmbeddings[index]) }))
      .sort((a, b) => b.score - a.score || a.card.entity_id.localeCompare(b.card.entity_id));
    const lexicalEvidence = lexical.filter(({ score }) => score > 0);
    return {
      cards: reciprocalRankFusion(lexicalEvidence.length ? [lexicalEvidence, dense] : [dense])
        .slice(0, maxCards)
        .map(({ card }) => card),
      method: 'hybrid_rrf',
      embedding_model: model || null,
      fallback: false,
    };
  } catch (error) {
    return {
      cards: diversifiedLexical.slice(0, maxCards).map(({ card }) => card),
      method: 'lexical',
      fallback: true,
      fallback_reason: text(error?.message).slice(0, 160),
    };
  }
}
