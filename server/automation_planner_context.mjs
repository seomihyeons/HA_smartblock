import { normalizeAutomationContext } from './automation_context.mjs';

const text = (value) => String(value ?? '').trim();

/**
 * Keep YAML at the host. The first LLM gets only these bounded labels/IDs.
 * Every selected ID is resolved against this same live/session catalog before
 * the full YAML can be sent to a second planning call.
 */
export function buildAutomationPlannerCatalog({ haCatalog = [], recentAutomations = [], selectedContext = null } = {}) {
  const entries = new Map();
  const add = (raw, sourceOverride = null) => {
    const ctx = normalizeAutomationContext({ ...raw, operation: 'modify' });
    if (!ctx) return;
    const source = sourceOverride || ctx.source;
    const id = source === 'home_assistant' ? ctx.automation_id
      : source === 'recent_draft' ? ctx.draft_id
      : source === 'workspace' ? 'current_workspace' : null;
    if (!id || !['home_assistant', 'recent_draft', 'workspace'].includes(source)) return;
    const entry = { ...ctx, source, id };
    const key = `${source}:${id}`;
    if (!entries.has(key)) entries.set(key, entry);
  };
  // Live HA configurations take precedence over a cached browser selection.
  for (const entry of haCatalog.slice(0, 100)) add(entry, 'home_assistant');
  for (const entry of recentAutomations.slice(0, 12)) add(entry, 'recent_draft');
  if (selectedContext && selectedContext.source !== 'home_assistant') add(selectedContext);
  const selectedSource = text(selectedContext?.source);
  const selectedId = selectedSource === 'home_assistant' ? text(selectedContext?.automation_id)
    : selectedSource === 'recent_draft' ? text(selectedContext?.draft_id)
    : selectedSource === 'workspace' ? 'current_workspace' : '';
  const selected = entries.get(`${selectedSource}:${selectedId}`) || null;
  return {
    entries: [...entries.values()],
    selected,
    summaries: [...entries.values()].slice(0, 60).map(({ source, id, title, enabled }) => ({
      source, id, title, enabled,
    })),
    selectedSummary: selected
      ? { source: selected.source, id: selected.id, title: selected.title }
      : null,
  };
}

export function resolveAutomationPlannerReference(plan, catalog) {
  const entries = Array.isArray(catalog?.entries) ? catalog.entries : [];
  const reference = plan?.automation_ref && typeof plan.automation_ref === 'object' ? plan.automation_ref : null;
  if (reference) {
    const source = text(reference.source);
    const id = text(reference.id);
    return entries.find((entry) => entry.source === source && entry.id === id) || null;
  }
  // An absent reference is not permission to guess between multiple rules.
  return entries.length === 1 ? entries[0] : null;
}
