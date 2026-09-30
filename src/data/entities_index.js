import { filterStudyEntities, STUDY_ENTITY_IDS } from './study_entity_filter.js';

// These are live ES module bindings. Entity dropdown option providers read the
// current collection only after the runtime Home Assistant request completes.
export let dummyEntities = [];
export let notifyDevices = [];

export function setStudyRuntimeEntities(runtimeEntities) {
  const result = filterStudyEntities(runtimeEntities);
  dummyEntities = result.entities;
  notifyDevices = [];
  return result;
}

export async function loadStudyRuntimeEntities(fetchImpl = globalThis.fetch) {
  // Never fall back to bundled GeekOfWeek, XHome, static, or old HA fixtures.
  dummyEntities = [];
  notifyDevices = [];

  if (typeof fetchImpl !== 'function') {
    const error = new Error('Runtime entity loading is unavailable: fetch is not defined.');
    console.error(error);
    return { ok: false, entities: [], missing: [...STUDY_ENTITY_IDS], error };
  }

  try {
    const response = await fetchImpl('/api/entities');
    if (!response?.ok) {
      throw new Error(`Runtime entity request failed (${response?.status ?? 'no response'}).`);
    }

    const payload = await response.json();
    const result = setStudyRuntimeEntities(payload?.entities);

    if (result.missing.length) {
      console.warn(
        `[HA-SmartBlock Study] Expected study entities: ${STUDY_ENTITY_IDS.length}; ` +
        `loaded study entities: ${result.entities.length}; missing: ${result.missing.join(', ')}`
      );
    } else {
      console.info(`[HA-SmartBlock Study] Loaded all ${result.entities.length} study entities.`);
    }

    return { ok: true, ...result };
  } catch (error) {
    // Keep the selector empty on failure so development corpus entities cannot
    // be selected by a study participant.
    dummyEntities = [];
    notifyDevices = [];
    console.error('[HA-SmartBlock Study] Failed to load runtime entities.', error);
    return { ok: false, entities: [], missing: [...STUDY_ENTITY_IDS], error };
  }
}
