import { checkContextSufficiency } from './context_sufficiency.mjs';

// Bridges existing trusted Node context to the sufficiency contract. This
// adapter does NOT infer natural-language requirements or execute any tools.
const value = x => typeof x === 'string' ? x.trim() : '';
const asArray = x => Array.isArray(x) ? x : [];
const validEntityId = x => /^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$/.test(value(x));

/** This resolver proves individual references, not full semantic coverage. */
function normalizeResolutions(references) {
  return asArray(references).flatMap(ref => {
    if (!ref || typeof ref !== 'object') return [];
    if (ref.status === 'ambiguous') {
      return [{ status: 'ambiguous', reference: value(ref.reference) }];
    }
    if (ref.status !== 'resolved' || !validEntityId(ref.entity_id)) return [];
    return [{
      status: 'resolved',
      entity_id: ref.entity_id,
      reference: value(ref.reference),
    }];
  });
}

/** HA automation IDs are a distinct namespace from recent draft IDs. */
function normalizeCatalog(catalog) {
  const verified = new Map();
  for (const item of asArray(catalog?.entries)) {
    if (item?.source !== 'home_assistant') continue;
    const id = value(item.automation_id);
    if (!id || value(item.id) !== id || verified.has(id)) continue;
    verified.set(id, {
      automation_id: id,
      ...(value(item.base_yaml) ? { base_yaml: item.base_yaml } : {}),
    });
  }
  return [...verified.values()];
}

/**
 * Never pass req.body, model JSON or unverifiable claims as host requirements.
 * Source remains provisional until a separate trusted semantic verifier exists.
 */
export function buildContextSufficiencyInput({
  fullEntityCards = [],
  retrievedEntityCards = [],
  entityResolution = [],
  plannerCatalog = null,
} = {}) {
  const refs = normalizeResolutions(entityResolution);
  const entities = [...new Set(refs.filter(ref => ref.status === 'resolved')
    .map(ref => ref.entity_id))];
  const retrievedIds = [...new Set(asArray(retrievedEntityCards)
    .map(card => value(card?.entity_id)).filter(validEntityId))];
  return {
    requirements: {
      source: 'provisional',
      complete: false,
      entities,
    },
    context: {
      entity_cards: asArray(fullEntityCards),
      retrieved_entity_ids: retrievedIds,
      entity_resolution: refs,
      automation_catalog: normalizeCatalog(plannerCatalog),
      // First LLM call receives only metadata, never full YAML.
      provided_automation_ids: [],
    },
  };
}

/** Only aggregate statuses/codes are reported; no personal or HA state data. */
export function assessContextSufficiencyShadow(hostContext) {
  const result = checkContextSufficiency(buildContextSufficiencyInput(hostContext));
  const issueCounts = {};
  for (const issue of [...result.missing_context, ...result.clarifications]) {
    const key = issue.type + ':' + issue.code;
    issueCounts[key] = (issueCounts[key] || 0) + 1;
  }
  return {
    schema_version: result.schema_version,
    mode: 'observe_only',
    status: result.status,
    next_action: result.next_action,
    requirements_verified: result.requirements_verified,
    counts: {
      ...result.counts,
      proposed_tool_calls: result.proposed_tool_calls.length,
    },
    issue_counts: issueCounts,
  };
}
