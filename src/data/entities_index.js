import { dummyEntities as haEntities, notifyDevices as haNotify } from './entities_homeassistant.js';
import { dummyEntities as geekEntities, notifyDevices as geekNotify } from './entities_geekofweek.js';

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

// GeekOfWeeks provides broad demo coverage. Home Assistant data is applied
// last so its current state and attributes win when an entity ID overlaps.
export const dummyEntities = mergeByEntityId(geekEntities, haEntities);
export const notifyDevices = mergeUnique(geekNotify, haNotify);
