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

function compact(value) {
  return text(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function compactNgrams(value, maximum = 6) {
  const parts = text(value).toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const phrases = new Set();
  for (let start = 0; start < parts.length; start += 1) {
    for (let end = start + 1; end <= Math.min(parts.length, start + maximum); end += 1) {
      phrases.add(parts.slice(start, end).join(''));
    }
  }
  return phrases;
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
      || card.domain === 'person'
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

function entityReferenceDocument(card) {
  return [
    `entity ${card.entity_id}`,
    `name ${card.friendly_name}`,
    `area ${card.area || ''}`,
    `domain ${card.domain}`,
    `device class ${card.device_class || ''}`,
  ].join('\n');
}

/**
 * Resolves only explicit EntityCard-name references.  It intentionally does
 * not infer rooms, device aliases, or an automation role from language.  That
 * keeps automatic bindings explainable and independent of one HA installation.
 */
export function resolveExplicitEntityReferences(query, cards, slots = {}) {
  const eligible = eligibleCards(cards);
  const phrases = compactNgrams(query);
  const requestedBindings = slots && typeof slots === 'object' && !Array.isArray(slots)
    && slots.entity_references && typeof slots.entity_references === 'object'
    ? slots.entity_references
    : {};
  const groups = new Map();

  for (const card of eligible) {
    const friendlyName = compact(card.friendly_name);
    const areaName = compact(card.area);
    const entityLabel = compact(card.entity_id.split('.').slice(1).join(' '));
    const entityLabelIsSpecific = entityLabel.split(' ').filter(Boolean).length > 1
      || entityLabel === friendlyName;
    const labels = new Set([
      // A label identical to an area is a location mention ("in Bedroom"),
      // not reliable evidence that the user selected the entity named
      // "Bedroom". Entity IDs remain explicit and eligible below.
      friendlyName && friendlyName !== areaName ? friendlyName : '',
      entityLabel && entityLabel !== areaName && entityLabelIsSpecific ? entityLabel : '',
    ]);
    for (const label of labels) {
      if (!label || !phrases.has(label)) continue;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(card);
    }
  }

  const maximalLabels = [...groups.keys()].filter((label) => (
    ![...groups.keys()].some((other) => other !== label && other.includes(label))
  ));
  return maximalLabels
    .sort((left, right) => right.length - left.length || left.localeCompare(right))
    .map((reference) => {
      const candidates = groups.get(reference)
        .sort((left, right) => left.entity_id.localeCompare(right.entity_id));
      const selectedId = text(requestedBindings[reference]);
      const selected = candidates.find((card) => card.entity_id === selectedId);
      if (selected) {
        return {
          reference,
          status: 'resolved',
          entity_id: selected.entity_id,
          evidence: 'user_selected_candidate',
        };
      }
      if (candidates.length === 1) {
        return {
          reference,
          status: 'resolved',
          entity_id: candidates[0].entity_id,
          evidence: 'unique_normalized_name_match',
        };
      }
      return {
        reference,
        status: 'ambiguous',
        candidates: candidates.map((card) => ({
          entity_id: card.entity_id,
          name: card.friendly_name,
          area: card.area || null,
          domain: card.domain,
        })),
        evidence: 'multiple_normalized_name_matches',
      };
    });
}

/**
 * During automation creation/modification, an automation's display name is
 * metadata, not a device target. Keep actual device bindings but prevent an
 * existing `automation.*` entity with the same alias from becoming a required
 * YAML reference. Explicit automation entities remain available for
 * information/control flows, which use the unfiltered resolver output.
 */
export function withoutAutomationRuleReferences(references) {
  const result = [];
  for (const reference of Array.isArray(references) ? references : []) {
    if (reference?.status === 'resolved') {
      if (!String(reference.entity_id || '').startsWith('automation.')) result.push(reference);
      continue;
    }
    if (reference?.status === 'ambiguous') {
      const candidates = (Array.isArray(reference.candidates) ? reference.candidates : [])
        .filter((candidate) => candidate?.domain !== 'automation' && !String(candidate?.entity_id || '').startsWith('automation.'));
      if (!candidates.length) continue;
      if (candidates.length === 1) {
        result.push({
          reference: reference.reference,
          status: 'resolved',
          entity_id: candidates[0].entity_id,
          evidence: 'unique_non_automation_name_match',
        });
      } else {
        result.push({ ...reference, candidates });
      }
    }
  }
  return result;
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
  // Service verbs such as "turn on" should not make every compatible device
  // appear relevant. Retrieval matches descriptive metadata; capability is a
  // separate validation concern after the request has been routed.
  const documentTokens = new Set(tokens(entityReferenceDocument(card)));
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

function isActionTarget(card) {
  // This is derived only from advertised capabilities.  In particular it
  // does not encode names, rooms, languages, or installation-specific rules.
  // Automation entities describe rules rather than physical targets, so they
  // are not useful members of the direct-action reserve.
  return card.domain !== 'automation'
    && Array.isArray(card.supported_actions)
    && card.supported_actions.length > 0;
}

function isEventSource(card) {
  // `binary_sensor` is a Home Assistant entity *kind*, not a device-name
  // heuristic. Other passive entities with a device class are also useful as
  // event sources (for example temperature, occupancy, or opening state).
  return card.domain === 'binary_sensor'
    || (!isActionTarget(card) && Boolean(text(card.device_class)));
}

function balancedOperationalRanking(ranking, maxCards, { preferActionTargets = false } = {}) {
  // A single global top-k can contain only one side of an ECA request (for
  // example, many environmental sensors but no controllable target). Reserve
  // bounded slots for live event sources and action targets, then fill the
  // rest by the original relevance ranking. This is metadata-driven and
  // remains applicable to arbitrary Home Assistant integrations.
  const limit = Math.max(1, maxCards);
  if (limit < 3) return ranking.slice(0, limit);

  const reserve = Math.max(1, Math.min(8, Math.floor(limit / 3)));
  const selected = [];
  const seen = new Set();
  const add = (entry) => {
    if (entry && !seen.has(entry.card.entity_id) && selected.length < limit) {
      selected.push(entry);
      seen.add(entry.card.entity_id);
    }
  };

  if (preferActionTargets) {
    // An abstract request with no name or metadata match has no deterministic
    // device reference. Keep a bounded set of live controllable options so
    // the model can reason from advertised capabilities, without relying on
    // lifestyle scenarios or a goal-to-device dictionary.
    const actionReserve = Math.max(1, Math.min(limit, Math.ceil((limit * 2) / 3)));
    ranking.filter(({ card }) => isActionTarget(card)).slice(0, actionReserve).forEach(add);
  }

  // Prefer binary state transitions inside the event-source reserve.  This
  // uses the standard Home Assistant entity kind, rather than matching words
  // such as “motion” or maintaining a sensor-name dictionary.  It prevents a
  // large collection of scalar/timestamp sensors from crowding out a discrete
  // event source such as a door, occupancy, or PIR sensor.
  let eventCount = 0;
  const addEvent = (entry) => {
    const before = selected.length;
    add(entry);
    if (selected.length > before) eventCount += 1;
  };
  ranking.filter(({ card }) => card.domain === 'binary_sensor').forEach((entry) => {
    if (eventCount < reserve) addEvent(entry);
  });
  ranking.filter(({ card }) => isEventSource(card)).forEach((entry) => {
    if (eventCount < reserve) addEvent(entry);
  });
  ranking.filter(({ card }) => isActionTarget(card))
    .slice(0, preferActionTargets ? Math.max(0, reserve - 1) : reserve)
    .forEach(add);
  ranking.forEach(add);
  return selected;
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

function externalDenseRanking(cards, response) {
  const byId = new Map(cards.map((card) => [card.entity_id, card]));
  const entries = Array.isArray(response?.ranking) ? response.ranking : [];
  const seen = new Set();
  const ranking = [];
  for (const [index, entry] of entries.entries()) {
    const entityId = text(entry?.entity_id);
    const card = byId.get(entityId);
    if (!card || seen.has(entityId)) continue;
    seen.add(entityId);
    ranking.push({ card, score: Number(entry?.score) || -(index + 1) });
  }
  if (!ranking.length) throw new Error('External embedding retrieval returned no eligible entities.');
  return ranking;
}

export async function retrieveEntityContext(query, cards, options = {}) {
  const maxCards = Math.max(1, Number.parseInt(String(options.maxCards || ''), 10) || 32);
  const lexical = rankEntitiesLexically(query, cards);
  const lexicalEvidence = lexical.filter(({ score }) => score > 0);
  const diversifiedLexical = lexicalEvidence.length ? lexicalEvidence : diversifyRanking(lexical);
  const mode = text(options.mode || options.env?.LLM_ENTITY_RETRIEVAL || process.env.LLM_ENTITY_RETRIEVAL || 'lexical')
    .toLocaleLowerCase();
  if (!['lexical', 'fastembed_hybrid'].includes(mode)) {
    throw new Error(`Unsupported entity retrieval mode: ${mode}. Use lexical or fastembed_hybrid.`);
  }
  if (mode === 'lexical' || lexical.length < 2) {
    const ranking = balancedOperationalRanking(diversifiedLexical, maxCards, {
      preferActionTargets: lexicalEvidence.length === 0,
    });
    return {
      cards: ranking.map(({ card }) => card),
      ranking: ranking.map(({ card, score }, index) => ({
        entity_id: card.entity_id,
        rank: index + 1,
        lexical_score: score,
      })),
      method: 'lexical',
      fallback: false,
    };
  }

  try {
    if (typeof options.fastembed !== 'function') {
      throw new Error('FastEmbed retrieval is not configured.');
    }
    const external = await options.fastembed({ query: text(query), cards: lexical.map(({ card }) => card) });
    const dense = externalDenseRanking(lexical.map(({ card }) => card), external);
    const ranking = balancedOperationalRanking(
      reciprocalRankFusion(lexicalEvidence.length ? [lexicalEvidence, dense] : [dense]),
      maxCards,
      { preferActionTargets: lexicalEvidence.length === 0 },
    );
    return {
      cards: ranking.map(({ card }) => card),
      ranking: ranking.map(({ card, score }, index) => ({
        entity_id: card.entity_id,
        rank: index + 1,
        fused_score: score,
      })),
      method: 'fastembed_hybrid_rrf',
      embedding_model: text(external?.embedding_model) || null,
      cache: external?.cache && typeof external.cache === 'object' ? external.cache : null,
      fallback: false,
    };
  } catch (error) {
    const ranking = balancedOperationalRanking(diversifiedLexical, maxCards, {
      preferActionTargets: lexicalEvidence.length === 0,
    });
    return {
      cards: ranking.map(({ card }) => card),
      ranking: ranking.map(({ card, score }, index) => ({
        entity_id: card.entity_id,
        rank: index + 1,
        lexical_score: score,
      })),
      method: 'lexical',
      fallback: true,
      fallback_reason: text(error?.message).slice(0, 160),
    };
  }
}
