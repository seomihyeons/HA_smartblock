import { dummyEntities as haEntities, notifyDevices as haNotify } from './entities_homeassistant.js';
import { dummyEntities as geekEntities, notifyDevices as geekNotify } from './entities_geekofweek.js';
import { dummyEntities as staticEntities, notifyDevices as staticNotify } from './entities_static.js';

function mergeByEntityId(...sources) {
  const merged = new Map();
  for (const source of sources) {
    for (const entity of source || []) {
      if (!entity?.entity_id) continue;
      merged.set(entity.entity_id, entity);
    }
  }
  return Array.from(merged.values());
}

function mergeUnique(...sources) {
  return Array.from(new Set(sources.flatMap((source) => source || [])));
}

// The bundled catalog remains available to offline unit tests and import
// fixtures. The application replaces this live binding at startup with the
// entities returned by the connected Home Assistant (XHome).
export let dummyEntities = mergeByEntityId(
  geekEntities,
  staticEntities,
  haEntities,
);
export let notifyDevices = mergeUnique(
  geekNotify,
  staticNotify,
  haNotify,
);

export let runtimeEntities = [];

const XHOME_DOMAINS = new Set([
  'automation', 'binary_sensor', 'camera', 'climate', 'cover', 'fan',
  'input_boolean', 'light', 'lock', 'media_player', 'person', 'sensor',
  'sun', 'switch',
]);

const ENTITY_ATTRIBUTE_KEYS = [
  'friendly_name', 'device_class', 'unit_of_measurement',
  'supported_features', 'supported_color_modes', 'color_mode',
  'assumed_state', 'options', 'preset_modes',
];

function entityFromHomeAssistantState(state) {
  const entityId = String(state?.entity_id || '').trim();
  const domain = entityId.split('.', 1)[0];
  if (!entityId || !XHOME_DOMAINS.has(domain)) return null;

  const sourceAttributes = state?.attributes && typeof state.attributes === 'object'
    ? state.attributes
    : {};
  const attributes = Object.fromEntries(ENTITY_ATTRIBUTE_KEYS
    .filter((key) => Object.hasOwn(sourceAttributes, key))
    .map((key) => [key, sourceAttributes[key]]));

  return {
    entity_id: entityId,
    domain,
    name: String(sourceAttributes.friendly_name || entityId),
    state: state?.state ?? '',
    attributes,
  };
}

/**
 * Replaces the fixture catalog with states from the Home Assistant instance
 * configured as the local `/ha` proxy. No other fixture or corpus entities
 * are retained in the interactive editor.
 */
export function setRuntimeHomeAssistantEntities(states) {
  const byId = new Map();
  for (const state of Array.isArray(states) ? states : []) {
    const entity = entityFromHomeAssistantState(state);
    if (entity) byId.set(entity.entity_id, entity);
  }
  runtimeEntities = Array.from(byId.values())
    .sort((left, right) => left.entity_id.localeCompare(right.entity_id));
  dummyEntities = runtimeEntities;
  notifyDevices = runtimeEntities
    .filter((entity) => entity.domain === 'notify')
    .map((entity) => entity.entity_id);
  return runtimeEntities;
}

/** Loads only devices available through the configured XHome connection. */
export async function loadRuntimeHomeAssistantEntities(fetchImpl = globalThis.fetch) {
  // Do not expose the bundled corpus while waiting for, or after a failure of,
  // the XHome request. This keeps interactive selectors source-pure.
  runtimeEntities = [];
  dummyEntities = [];
  notifyDevices = [];
  try {
    if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable');
    const response = await fetchImpl('/ha/api/states');
    if (!response?.ok) {
      throw new Error(`XHome entity request failed (${response?.status ?? 'no response'}).`);
    }
    const states = await response.json();
    if (!Array.isArray(states)) throw new Error('XHome states response was not an array.');
    return { ok: true, entities: setRuntimeHomeAssistantEntities(states) };
  } catch (error) {
    console.error('[HA-SmartBlock] XHome entity loading failed.', error);
    return { ok: false, entities: [], error };
  }
}
