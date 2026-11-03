// Pure client-side filtering for the already loaded Home Assistant list.
export function filterAutomations(automations, query) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return Array.isArray(automations) ? automations : [];
  return (Array.isArray(automations) ? automations : []).filter((item) => (
    String(item?.name || '').toLowerCase().includes(needle) ||
    String(item?.id || '').toLowerCase().includes(needle) ||
    String(item?.entity_id || '').toLowerCase().includes(needle)
  ));
}

// Home Assistant exposes an automation's enabled state as the state of its
// `automation.*` entity. Keep this separate from `editable`: an automation
// can be disabled in HA and still be safely imported for inspection/editing.
export function isAutomationEnabled(automation) {
  return String(automation?.state || '').trim().toLowerCase() === 'on';
}
