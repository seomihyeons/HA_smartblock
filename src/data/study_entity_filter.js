export const STUDY_ENTITY_IDS = Object.freeze([
  'binary_sensor.front_door',
  'binary_sensor.back_door',
  'binary_sensor.entrance_door',
  'binary_sensor.bedroom_door',
  'binary_sensor.bathroom_door',
  'binary_sensor.kitchen_door',
  'binary_sensor.entrance_motion',
  'binary_sensor.bedroom_motion',
  'binary_sensor.living_motion',
  'device_tracker.resident',
  'binary_sensor.night_mode',
  'light.entrance',
  'light.hallway',
  'light.bedroom',
  'light.kitchen',
  'light.living_room',
  'siren.home_alarm',
]);

const STUDY_ENTITY_ID_SET = new Set(STUDY_ENTITY_IDS);

function normalizeRuntimeEntity(entity) {
  const entityId = String(entity?.entity_id || '').trim();
  if (!entityId || !entityId.includes('.')) return null;

  const attributes = entity?.attributes && typeof entity.attributes === 'object'
    ? entity.attributes
    : {};
  const domain = entityId.split('.', 1)[0];
  const name = String(entity?.name || entity?.friendly_name || attributes.friendly_name || entityId);

  return {
    entity_id: entityId,
    domain,
    name,
    state: entity?.state,
    attributes,
  };
}

// Runtime Home Assistant is the selector source of truth.  This normalizes
// every returned state without consulting the Study task fixture above.
export function normalizeRuntimeEntities(runtimeEntities) {
  const source = Array.isArray(runtimeEntities) ? runtimeEntities : [];
  const byId = new Map();

  for (const entity of source) {
    const normalized = normalizeRuntimeEntity(entity);
    if (normalized) byId.set(normalized.entity_id, normalized);
  }

  return {
    entities: [...byId.values()].sort((a, b) => a.entity_id.localeCompare(b.entity_id)),
  };
}

// The controlled Study set is retained separately for study validation.  It
// never replaces the full runtime collection used by selectors and toolbox.
export function filterStudyEntities(runtimeEntities) {
  const byId = new Map(
    normalizeRuntimeEntities(runtimeEntities).entities.map((entity) => [entity.entity_id, entity])
  );
  const entities = STUDY_ENTITY_IDS.map((entityId) => byId.get(entityId)).filter(Boolean);
  const missing = STUDY_ENTITY_IDS.filter((entityId) => !byId.has(entityId));
  return { entities, missing };
}
