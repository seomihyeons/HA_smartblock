// Legacy Ollama benchmark results and Python planners share one host contract.
export function normalizeAssistantPlan(result = {}, payload = {}, cards = []) {
  if (result.plan || result.generation_error || result.status === 'needs_confirmation') return result;
  if (result.status === 'needs_clarification') {
    return { ...result, intent: 'routine', plan: {}, missing_fields: result.questions || [result.question || 'request_details'] };
  }
  if (['unsupported', 'no_match'].includes(result.status)) return { ...result, intent: 'other', plan: {}, validation: { valid: true, errors: [] } };
  if (result.status === 'control_intent') {
    const ids = result.candidate_entity_ids || [];
    const selected = ids.includes(payload.selected_entity_id) ? payload.selected_entity_id : ids.length === 1 ? ids[0] : null;
    if (!selected) return { ...result, status: 'needs_confirmation', role: 'control_target', candidates: cards.filter((card) => ids.includes(card.entity_id)) };
    return { ...result, intent: 'control', plan: { operation: 'service_control', target: { selector: 'entity', entity_id: selected }, effect: { service: result.service, data: {} } }, validation: { valid: true, errors: [] } };
  }
  if (result.status === 'success' && result.automation) {
    return { ...result, intent: 'automation', plan: { operation: 'automation_generation', automation: result.automation }, validation: { ...result.validation, valid: !result.validation?.errors?.length } };
  }
  return { ...result, generation_error: result.error || 'The model did not produce a usable plan.', validation: { valid: false, errors: result.validation?.errors || [] } };
}
