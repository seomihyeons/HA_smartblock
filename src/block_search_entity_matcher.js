import {
  ACTION_DOMAINS,
  HOMEASSISTANT_TARGET_DOMAINS,
  STATE_DOMAINS,
} from './data/options.js';
import { getEntityDisplayName } from './data/study_entity_filter.js';

const ENTITY_FIELD = 'ENTITY_ID';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function tokenize(value) {
  return normalize(value).match(/[a-z0-9]+/g) || [];
}

function entityDomain(entity) {
  return String(entity?.entity_id || '').split('.', 1)[0];
}

function hasNumericState(entity) {
  return !Number.isNaN(Number.parseFloat(entity?.state));
}

function hasNumericAttribute(entity) {
  return Object.values(entity?.attributes || {})
    .some((value) => !Number.isNaN(Number.parseFloat(value)));
}

function compareEntities(left, right) {
  const byName = getEntityDisplayName(left).localeCompare(
    getEntityDisplayName(right),
    'en',
    { sensitivity: 'base', numeric: true }
  );
  if (byName !== 0) return byName;

  return String(left?.entity_id || '').localeCompare(
    String(right?.entity_id || ''),
    'en',
    { sensitivity: 'base', numeric: true }
  );
}

function searchFields(entity) {
  return [
    getEntityDisplayName(entity),
    entity?.entity_id,
    entity?.domain || entityDomain(entity),
    entity?.attributes?.device_class,
  ]
    .map(normalize)
    .filter(Boolean);
}

/**
 * Scores an Entity identity match without looking at its transient state.
 * State and service words discover blocks, but must not silently choose an
 * unrelated Entity for a search such as "turn on" or "opened".
 */
export function scoreEntitySearch(query, entity) {
  const queryText = normalize(query);
  const queryTokens = tokenize(queryText);
  if (!queryText || !queryTokens.length) return -1;

  const fields = searchFields(entity);
  if (!fields.length) return -1;

  if (fields.some((field) => field === queryText)) return 1000;

  const joined = fields.join(' ');
  if (joined.includes(queryText)) return 800;

  const searchableTokens = new Set(tokenize(joined));
  let score = 0;
  for (const queryToken of queryTokens) {
    if (searchableTokens.has(queryToken)) {
      score += 100;
      continue;
    }

    const startsWithToken = [...searchableTokens].some((token) => token.startsWith(queryToken));
    if (startsWithToken) {
      score += 75;
      continue;
    }

    const containsToken = [...searchableTokens].some((token) => token.includes(queryToken));
    if (containsToken) {
      score += 50;
      continue;
    }

    return -1;
  }
  return score;
}

/**
 * A binding is deliberately supplied only for blocks with one unambiguous
 * Entity selector. Containers, raw blocks, and multi-target blocks keep their
 * existing defaults because an inferred target would change their meaning.
 */
export function getSearchEntityBinding(type) {
  const stateMatch = /^(?:event_(.+)_state|condition_state_(.+))$/.exec(type);
  const stateDomain = stateMatch?.[1] || stateMatch?.[2] || '';
  if (STATE_DOMAINS.includes(stateDomain)) {
    return {
      field: ENTITY_FIELD,
      accepts: (entity) => entityDomain(entity) === stateDomain,
    };
  }

  if (type === 'event_sensor_numeric_state' || type === 'condition_numeric_state_entity') {
    return { field: ENTITY_FIELD, accepts: hasNumericState };
  }

  if (type === 'condition_numeric_state_attribute') {
    return { field: ENTITY_FIELD, accepts: hasNumericAttribute };
  }

  const actionMatch = /^action_(.+)$/.exec(type);
  const actionDomain = actionMatch?.[1] || '';
  if (ACTION_DOMAINS.includes(actionDomain)) {
    if (actionDomain === 'ecobee') {
      return {
        field: ENTITY_FIELD,
        accepts: (entity) => entityDomain(entity) === 'climate',
      };
    }
    if (actionDomain === 'homeassistant') {
      return {
        field: ENTITY_FIELD,
        accepts: (entity) => HOMEASSISTANT_TARGET_DOMAINS.includes(entityDomain(entity)),
      };
    }
    return {
      field: ENTITY_FIELD,
      accepts: (entity) => entityDomain(entity) === actionDomain,
    };
  }

  if (type === 'action_notify') {
    return {
      field: 'TARGET',
      accepts: (entity) => entityDomain(entity) === 'notify',
    };
  }

  return null;
}

/**
 * Returns the one deterministic Entity that should seed a Search result.
 * Short queries deliberately do not seed an Entity: they remain useful for
 * block discovery while avoiding surprising choices during type-ahead.
 */
export function selectSearchEntity(type, query, entities) {
  const binding = getSearchEntityBinding(type);
  const compactQuery = tokenize(query).join('');
  if (!binding || compactQuery.length < 3) return null;

  const candidates = (Array.isArray(entities) ? entities : [])
    .filter((entity) => String(entity?.entity_id || '').includes('.'))
    .filter(binding.accepts)
    .map((entity) => ({ entity, score: scoreEntitySearch(query, entity) }))
    .filter(({ score }) => score >= 0)
    .sort((left, right) => right.score - left.score || compareEntities(left.entity, right.entity));

  const selected = candidates[0]?.entity;
  if (!selected) return null;

  return {
    field: binding.field,
    entityId: String(selected.entity_id),
    score: candidates[0].score,
  };
}
