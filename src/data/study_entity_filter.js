export const STUDY_ENTITY_IDS = Object.freeze([
  'binary_sensor.entrance_door',
  'binary_sensor.back_door',
  'binary_sensor.bedroom_door',
  'binary_sensor.bathroom_door',
  'binary_sensor.entrance_motion',
  'binary_sensor.bedroom_motion',
  'binary_sensor.living_motion',
  'sensor.living_room_humidity',
  'switch.dehumidifier',
  'cover.bedroom_curtain',
  'light.entrance',
  'light.hallway',
  'light.bedroom',
  'light.kitchen',
  'light.living_room',
  'person.test_user',
  'notify.test_user',
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

// Entity dropdowns show a friendly name when Home Assistant provides one.
// Keep the backing runtime list in that same visual order so every block that
// filters `dummyEntities` presents Entity selectors consistently.
export function getEntityDisplayName(entity) {
  return String(
    entity?.attributes?.friendly_name ||
    entity?.name ||
    entity?.friendly_name ||
    entity?.entity_id ||
    ''
  ).trim();
}

function compareEntitiesByDisplayName(left, right) {
  const byName = getEntityDisplayName(left).localeCompare(
    getEntityDisplayName(right),
    'en',
    { sensitivity: 'base', numeric: true }
  );
  if (byName !== 0) return byName;
  return String(left?.entity_id || '').localeCompare(
    String(right?.entity_id || ''),
    'en',
    { sensitivity: 'base', numeric: true }
  );
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
    entities: [...byId.values()].sort(compareEntitiesByDisplayName),
  };
}

/**
 * The study Home Assistant may expose its own administrator/device-tracker
 * states alongside the task corpus. They must never become selectable as a
 * participant or notification recipient. Keep the one deliberately modelled
 * study participant and its notification endpoint only.
 */
export function sanitizeStudyRuntimeEntities(runtimeEntities) {
  const blockedUserDomains = new Set(['person', 'device_tracker', 'notify']);
  const allowedUserEntities = new Set([
    'person.test_user',
    'notify.test_user',
  ]);

  const { entities } = normalizeRuntimeEntities(runtimeEntities);
  return {
    entities: entities.filter((entity) =>
      !blockedUserDomains.has(entity.domain) || allowedUserEntities.has(entity.entity_id)
    ),
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
