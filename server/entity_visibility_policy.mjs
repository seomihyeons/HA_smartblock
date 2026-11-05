// Supporting entities can be necessary to implement a simulated capability
// without being valid LLM retrieval candidates. The RuleBot fixture uses this
// hidden tracker solely to drive person.test_user in Home Assistant.
const INTERNAL_ONLY_ENTITY_IDS = new Set([
  'device_tracker.test_user',
]);

export function filterAssistantEntityStates(states) {
  return (Array.isArray(states) ? states : []).filter((state) => {
    const entityId = String(state?.entity_id || '').trim();
    const entityState = String(state?.state || '').trim().toLowerCase();
    return entityId
      && entityState !== 'unavailable'
      && !INTERNAL_ONLY_ENTITY_IDS.has(entityId);
  });
}

export const internalOnlyEntityIds = Object.freeze([...INTERNAL_ONLY_ENTITY_IDS]);
