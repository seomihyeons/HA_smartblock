import { filterStudyEntities, STUDY_ENTITY_IDS } from './study_entity_filter.js';

// Runtime Home Assistant entities are kept separately from the controlled
// 17-entity study set. Generic/domain blocks should mirror the connected HA
// instance, while studyEntities remains available for study validation/reset/
// evaluator code.
//
// dummyEntities is retained as the legacy live binding consumed by existing
// block option providers. It now represents the full runtime entity set.
export let runtimeEntities = [];
export let studyEntities = [];
export let dummyEntities = [];
export let notifyDevices = [];

function normalizeRuntimeEntity(entity) {
  const entityId = String(entity?.entity_id || '').trim();
  if (!entityId || !entityId.includes('.')) return null;

  const attributes = entity?.attributes && typeof entity.attributes === 'object'
    ? entity.attributes
    : {};
  const domain = String(entity?.domain || entityId.split('.', 1)[0]);
  const name = String(
    entity?.name ||
    entity?.friendly_name ||
    attributes.friendly_name ||
    entityId
  );

  return {
    entity_id: entityId,
    domain,
    name,
    state: entity?.state,
    attributes,
  };
}

function normalizeRuntimeEntities(source) {
  return (Array.isArray(source) ? source : [])
    .map(normalizeRuntimeEntity)
    .filter(Boolean)
    .sort((a, b) => a.entity_id.localeCompare(b.entity_id));
}

export function setStudyRuntimeEntities(sourceEntities) {
  runtimeEntities = normalizeRuntimeEntities(sourceEntities);
  dummyEntities = runtimeEntities;

  const result = filterStudyEntities(runtimeEntities);
  studyEntities = result.entities;
  notifyDevices = [];

  return {
    ...result,
    runtimeEntities,
  };
}

export async function loadStudyRuntimeEntities(fetchImpl = globalThis.fetch) {
  // Do not fall back to bundled GeekOfWeek, XHome, static, or old HA fixtures.
  // The live HA runtime is the only source for UI entity selectors.
  runtimeEntities = [];
  studyEntities = [];
  dummyEntities = [];
  notifyDevices = [];

  if (typeof fetchImpl !== 'function') {
    const error = new Error('Runtime entity loading is unavailable: fetch is not defined.');
    console.error(error);
    return {
      ok: false,
      entities: [],
      runtimeEntities: [],
      missing: [...STUDY_ENTITY_IDS],
      error,
    };
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
      console.info(
        `[HA-SmartBlock Study] Loaded ${result.runtimeEntities.length} runtime entities; ` +
        `all ${result.entities.length} study entities are present.`
      );
    }

    return { ok: true, ...result };
  } catch (error) {
    runtimeEntities = [];
    studyEntities = [];
    dummyEntities = [];
    notifyDevices = [];
    console.error('[HA-SmartBlock Study] Failed to load runtime entities.', error);
    return {
      ok: false,
      entities: [],
      runtimeEntities: [],
      missing: [...STUDY_ENTITY_IDS],
      error,
    };
  }
}
