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

export const dummyEntities = merged;
export const notifyDevices = [
  ...(haNotify || []),
  ...(staticNotify || []),
];
