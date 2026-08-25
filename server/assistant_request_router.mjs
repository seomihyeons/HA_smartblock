export function createAssistantRequestRouter({ createDraft, previewControl }) {
  if (typeof createDraft !== 'function' || typeof previewControl !== 'function') {
    throw new TypeError('Assistant router requires draft and control handlers');
  }

  return {
    async handle(payload = {}) {
      const result = await createDraft({ ...payload, interaction_mode: 'auto' });
      if (result.status !== 'control_intent') {
        return { intent: 'automation', ...result };
      }
      const preview = await previewControl({
        service: result.service,
        candidate_entity_ids: result.candidate_entity_ids,
        selected_entity_id: payload.selected_entity_id,
      });
      return { intent: 'immediate_control', ...preview };
    },
  };
}
