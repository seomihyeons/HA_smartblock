// Client-side filtering for an already loaded Home Assistant automation list.
// This module intentionally has no DOM or API dependency so it can be tested
// independently of the panel that displays the result.
export function filterAutomations(automations, query) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return Array.isArray(automations) ? automations : [];

  return (Array.isArray(automations) ? automations : []).filter((item) => {
    const alias = String(item?.name || '').toLowerCase();
    const id = String(item?.id || '').toLowerCase();
    return alias.includes(needle) || id.includes(needle);
  });
}
