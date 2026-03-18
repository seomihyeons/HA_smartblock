// Entity source aggregator with priority:
// homeassistant > static > geekofweek

import { dummyEntities as haEntities, notifyDevices as haNotify } from './entities_homeassistant.js';
import { dummyEntities as staticEntities, notifyDevices as staticNotify } from './entities_static.js';
import { dummyEntities as geekEntities } from './entities_geekofweek.js';

function mergeEntities(list) {
  const map = new Map();
  for (const e of list) {
    if (!e || !e.entity_id) continue;
    map.set(e.entity_id, e);
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
