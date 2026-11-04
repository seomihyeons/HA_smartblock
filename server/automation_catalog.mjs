import yaml from 'js-yaml';

const text = (value) => String(value ?? '').trim();

function normalized(value) {
  return text(value).normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function terms(value) {
  return normalized(value).split(' ').filter((word) => word.length >= 2 && !new Set([
    'the', 'this', 'that', 'an', 'a', 'automation', 'rule', 'modify', 'edit', 'update',
    'change', 'please', 'earlier', 'previous', 'existing', 'current', 'created', 'we',
  ]).has(word));
}

export function isActiveAutomationState(state) {
  return text(state?.entity_id).startsWith('automation.')
    && text(state?.state).toLocaleLowerCase() === 'on'
    && Boolean(text(state?.attributes?.id));
}

export function catalogEntryFromConfig(meta, config) {
  if (!isActiveAutomationState(meta) || !config || typeof config !== 'object' || Array.isArray(config)
    || config.enabled === false) return null;
  const id = text(meta.attributes?.id);
  const title = text(config.alias) || text(meta.attributes?.friendly_name) || text(meta.entity_id);
  return {
    source: 'home_assistant',
    title,
    automation_id: id,
    entity_id: text(meta.entity_id),
    enabled: true,
    base_yaml: yaml.dump(config, { noRefs: true, lineWidth: -1, sortKeys: false }),
  };
}

function score(command, candidate) {
  const query = normalized(command);
  const title = normalized(candidate.title);
  const id = normalized(candidate.automation_id);
  const entityId = normalized(candidate.entity_id);
  if (!query || !title) return 0;
  if (query.includes(title) || (id && query.includes(id)) || (entityId && query.includes(entityId))) return 1;
  const queryTerms = new Set(terms(query));
  const titleTerms = terms(title);
  if (!queryTerms.size || !titleTerms.length) return 0;
  const overlap = titleTerms.filter((word) => queryTerms.has(word)).length;
  return overlap / titleTerms.length;
}

/**
 * Match against the complete active HA catalog, but only auto-select when the
 * title reference is clearly unique. The caller can present ambiguous matches.
 */
export function resolveAutomationReference(command, catalog) {
  const ranked = (Array.isArray(catalog) ? catalog : [])
    .map((candidate) => ({ candidate, score: score(command, candidate) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.candidate.title.localeCompare(right.candidate.title));
  if (!ranked.length) return { status: 'no_match', candidates: [] };
  const [top, runnerUp] = ranked;
  if (top.score === 1 && (!runnerUp || runnerUp.score < 1)) {
    return { status: 'selected', candidate: top.candidate, candidates: ranked.map((item) => item.candidate) };
  }
  if (top.score >= 0.75 && (!runnerUp || top.score - runnerUp.score >= 0.25)) {
    return { status: 'selected', candidate: top.candidate, candidates: ranked.map((item) => item.candidate) };
  }
  return { status: 'ambiguous', candidates: ranked.slice(0, 12).map((item) => item.candidate) };
}
