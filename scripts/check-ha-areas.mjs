#!/usr/bin/env node
/** Local read-only area grounding diagnostic for the isolated pilot Home Assistant.
 * HA_BASE_URL=http://127.0.0.1:8124 HA_TOKEN=... node scripts/check-ha-areas.mjs
 */
import { fetchHomeAssistantRegistries, areaNamesByEntity } from '../server/ha_registry_client.mjs';

const baseUrl = process.env.HA_BASE_URL || 'http://127.0.0.1:8124';
const token = process.env.HA_TOKEN;
if (!token) {
  console.error('Set HA_TOKEN (environment variable only).');
  process.exit(2);
}
const fixtures = [
  ['light.bedroom','Bedroom'],
  ['light.bedside_lamp','Bedroom'],
  ['media_player.bedroom_speaker','Bedroom'],
  ['cover.living_room_curtain','Living Room'],
  ['fan.bathroom_fan','Bathroom'],
  ['valve.gas_valve','Kitchen'],
  ['lock.entrance_lock','Entrance'],
  ['light.hallway','Hallway'],
];
async function run() {
  const registry = await fetchHomeAssistantRegistries({ baseUrl, token, timeoutMs: 5000 });
  const map = areaNamesByEntity(registry);
  const response = await fetch(new URL('api/states', baseUrl.replace(/\/?$/, '/')), {
    headers: { Authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Home Assistant states request failed: ' + response.status);
  const states = await response.json();
  if (!Array.isArray(states)) throw new Error('Home Assistant states are not an array');
  const live = new Set(states.map(s => s.entity_id));
  let failed = 0;
  for (const [id, expectedArea] of fixtures) {
    const actual = map.get(id) || null;
    const registered = live.has(id);
    const ok = registered && actual === expectedArea;
    if (!ok) failed++;
    console.log((ok ? 'PASS' : 'CHECK') + ' ' + id + ': area=' + (actual ?? '<none>') +
      ', expected=' + expectedArea + ', entity=' + (registered ? 'available' : 'missing'));
  }
  console.log('Area registry checks: ' + (fixtures.length - failed) + '/' + fixtures.length + ' passed');
  if (failed) process.exitCode = 1;
}
run().catch(err => { console.error('Area diagnostic failed:', err.message); process.exitCode = 1; });
