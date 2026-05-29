import { dummyEntities as haEntities, notifyDevices as haNotify } from './entities_homeassistant.js';
import { dummyEntities as staticEntities, notifyDevices as staticNotify } from './entities_static.js';
import { dummyEntities as geekEntities } from './entities_geekofweek.js';

function mergeEntities(list) {
  const map = new Map();
  for (const entity of list) {
    if (!entity || !entity.entity_id) continue;
    map.set(entity.entity_id, entity);
  }
  return Array.from(map.values());
}

const merged = mergeEntities([
  ...(geekEntities || []),
  ...(staticEntities || []),
  ...(haEntities || []),
]);

export let dummyEntities = merged;
export let notifyDevices = [
  ...(haNotify || []),
  ...(staticNotify || []),
];

export let entitySource = 'static';

function normalizeRuntimeEntity(entity) {
  const entityId = String(entity?.entity_id || '').trim();
  if (!entityId || !entityId.includes('.')) return null;

  const attributes = (
    entity.attributes &&
    typeof entity.attributes === 'object' &&
    !Array.isArray(entity.attributes)
  ) ? entity.attributes : {};

  return {
    ...entity,
    entity_id: entityId,
    state: entity.state,
    attributes,
  };
}

export function setRuntimeEntities(entities, { source = 'runtime' } = {}) {
  const normalized = (Array.isArray(entities) ? entities : [])
    .map(normalizeRuntimeEntity)
    .filter(Boolean);

  if (!normalized.length) return false;

  dummyEntities = mergeEntities(normalized)
    .sort((a, b) => String(a.entity_id).localeCompare(String(b.entity_id)));
  entitySource = source;
  window.dispatchEvent?.(new CustomEvent('ha-smartblock-entities-loaded', {
    detail: {
      source: entitySource,
      count: dummyEntities.length,
    },
  }));
  return true;
}

export async function loadRuntimeEntities({ endpoint = 'api/entities' } = {}) {
  try {
    const res = await fetch(endpoint, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    const ok = setRuntimeEntities(payload?.entities || [], {
      source: payload?.source || 'homeassistant',
    });
    if (!ok) throw new Error('No Home Assistant entities returned');
    console.info(`[HA SmartBlock] Loaded ${dummyEntities.length} entities from ${entitySource}.`);
    return { ok: true, source: entitySource, count: dummyEntities.length };
  } catch (err) {
    entitySource = 'static-fallback';
    console.warn('[HA SmartBlock] Using bundled fallback entities:', err);
    return { ok: false, source: entitySource, count: dummyEntities.length, error: err };
  }
}
