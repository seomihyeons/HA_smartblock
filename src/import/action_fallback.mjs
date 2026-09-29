export function mapActionsWithIndividualFallback(
  actions,
  { createAction, createRawAction },
) {
  if (!Array.isArray(actions)) return [];
  if (typeof createAction !== 'function' || typeof createRawAction !== 'function') {
    throw new TypeError('createAction and createRawAction are required.');
  }

  return actions.map((action, index) => {
    try {
      return createAction(action, index) || createRawAction(action, index);
    } catch {
      return createRawAction(action, index);
    }
  });
}
