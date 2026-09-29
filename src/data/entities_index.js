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

// Corpus fixtures load first. Static Synthetic Home/user fixtures and then
// runtime-generated Home Assistant data win when an entity ID overlaps.
export const dummyEntities = mergeByEntityId(
  geekEntities,
  staticEntities,
  haEntities,
);
export const notifyDevices = mergeUnique(
  geekNotify,
  staticNotify,
  haNotify,
);
