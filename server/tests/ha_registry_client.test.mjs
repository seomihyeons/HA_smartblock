import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  HA_REGISTRY_TYPES,
  homeAssistantWebSocketUrl,
  fetchHomeAssistantRegistries,
  areaNamesByEntity,
  createAreaRegistryCache,
} from '../ha_registry_client.mjs';
import { buildEntityCards } from '../entity_cards.mjs';

const snapshot = {
  areas: [{ area_id: 'bedroom', name: 'Bedroom' }, { area_id: 'living_room', name: 'Living Room' }],
  devices: [
    { id: 'dev_bed', area_id: 'bedroom' },
    { id: 'dev_living', area_id: 'living_room' },
    { id: 'dev_none', area_id: null },
  ],
  entities: [
    { entity_id: 'light.bedside_lamp', device_id: 'dev_bed', area_id: null },
    { entity_id: 'light.living_room', device_id: 'dev_living', area_id: null },
    { entity_id: 'light.override', device_id: 'dev_bed', area_id: 'living_room' },
    { entity_id: 'sensor.unassigned', device_id: 'dev_none', area_id: null },
    { entity_id: 'sensor.no_device', device_id: null, area_id: 'bedroom' },
    { entity_id: 'sensor.missing', device_id: 'not_found', area_id: null },
  ],
};

test('Home Assistant WS URL requires HTTP(S), no credentials, and preserves proxy base path', () => {
  assert.equal(homeAssistantWebSocketUrl('http://127.0.0.1:8124'), 'ws://127.0.0.1:8124/api/websocket');
  assert.equal(homeAssistantWebSocketUrl('https://ha.example.local/ha/'), 'wss://ha.example.local/ha/api/websocket');
  assert.throws(() => homeAssistantWebSocketUrl('ftp://ha.local'), /http/);
  assert.throws(() => homeAssistantWebSocketUrl('http://user:pass@ha.local'), /credentials/);
});

test('area resolver honors Entity area override, Device inherited area, and null for unknowns', () => {
  const areas = areaNamesByEntity(snapshot);
  assert.equal(areas.get('light.bedside_lamp'), 'Bedroom');
  assert.equal(areas.get('light.living_room'), 'Living Room');
  assert.equal(areas.get('light.override'), 'Living Room');
  assert.equal(areas.get('sensor.no_device'), 'Bedroom');
  assert.equal(areas.get('sensor.unassigned'), null);
  assert.equal(areas.get('sensor.missing'), null);
  assert.equal(areas.has('light.nonexistent'), false);
});

test('EntityCard receives live HA registry area and does not hallucinate one', () => {
  const states = [
    { entity_id: 'light.bedside_lamp', state: 'on', attributes: { friendly_name: 'Bedside Lamp' } },
    { entity_id: 'light.override', state: 'off', attributes: { area: 'Bedroom' } },
    { entity_id: 'sensor.unassigned', state: '21', attributes: { area: 'Incorrect' } },
    { entity_id: 'switch.legacy', state: 'off', attributes: { area: 'Kitchen' } },
  ];
  const cards = buildEntityCards(states, { areaByEntityId: areaNamesByEntity(snapshot) });
  const byId = new Map(cards.map(c => [c.entity_id, c]));
  assert.equal(byId.get('light.bedside_lamp').area, 'Bedroom');
  assert.equal(byId.get('light.override').area, 'Living Room');
  assert.equal(byId.get('sensor.unassigned').area, null);
  assert.equal(byId.get('switch.legacy').area, 'Kitchen');
  assert.equal(buildEntityCards([states[0]])[0].area, null);
});

test('WS client authenticates once, submits three parallel read-only registry requests', async () => {
  let client;
  class MockWebSocket extends EventEmitter {
    constructor(url, options) {
      super();
      assert.equal(url, 'ws://ha.test:8123/api/websocket');
      assert.equal(options.maxPayload, 16 * 1024 * 1024);
      client = this;
      this.sent = [];
      queueMicrotask(() => this.emit('message', JSON.stringify({ type: 'auth_required' })));
    }
    send(raw) {
      const message = JSON.parse(raw);
      this.sent.push(message);
      if (message.type === 'auth') {
        assert.equal(message.access_token, 'local-test-token');
        queueMicrotask(() => this.emit('message', JSON.stringify({ type: 'auth_ok' })));
      } else if (message.id === 3) {
        for (const id of [3, 1, 2]) queueMicrotask(() => this.emit('message', JSON.stringify({
          type: 'result', id, success: true,
          result: id === 1 ? snapshot.areas : id === 2 ? snapshot.devices : snapshot.entities,
        })));
      }
    }
    close() {}
  }
  const result = await fetchHomeAssistantRegistries({
    baseUrl: 'http://ha.test:8123', token: 'local-test-token',
    WebSocketImpl: MockWebSocket,
  });
  assert.equal(client.sent.length, 4);
  assert.deepEqual(client.sent.slice(1).map(m => m.type), HA_REGISTRY_TYPES);
  assert.deepEqual(result, snapshot);
});

test('WS auth rejection and denied registry queries do not return partial grounding', async () => {
  class RejectAuth extends EventEmitter {
    constructor() {
      super();
      queueMicrotask(() => this.emit('message', JSON.stringify({ type: 'auth_invalid' })));
    }
    close() {}
  }
  await assert.rejects(() => fetchHomeAssistantRegistries({
    baseUrl: 'http://ha.test', token: 'bad', WebSocketImpl: RejectAuth,
  }), /authentication rejected/);

  class RejectQuery extends EventEmitter {
    constructor() {
      super();
      queueMicrotask(() => this.emit('message', JSON.stringify({ type: 'auth_required' })));
    }
    send(raw) {
      const msg = JSON.parse(raw);
      if (msg.type === 'auth') queueMicrotask(() => this.emit('message', JSON.stringify({ type: 'auth_ok' })));
      else if (msg.id === 3) queueMicrotask(() => this.emit('message', JSON.stringify({
        type: 'result', id: 2, success: false,
      })));
    }
    close() {}
  }
  await assert.rejects(() => fetchHomeAssistantRegistries({
    baseUrl: 'http://ha.test', token: 'test', WebSocketImpl: RejectQuery,
  }), /unsuccessful/);
});

test('cache shares in-flight request, honors TTL, and returns no invented area on failure', async () => {
  let clock = 1000;
  let calls = 0;
  let failing = false;
  let observedErrors = 0;
  const cache = createAreaRegistryCache({
    now: () => clock, ttlMs: 5000, failureTtlMs: 1000,
    onError: () => { observedErrors++; },
    fetchRegistries: async () => {
      calls++;
      await Promise.resolve();
      if (failing) throw new Error('temporarily unavailable');
      return snapshot;
    },
  });
  const input = { baseUrl: 'http://ha.test', token: 'mock-secret' };
  const [one, two] = await Promise.all([cache.get(input), cache.get(input)]);
  assert.strictEqual(one, two);
  assert.equal(calls, 1);
  assert.equal((await cache.get(input)).get('light.bedside_lamp'), 'Bedroom');
  assert.equal(calls, 1);
  clock += 5001;
  failing = true;
  assert.equal(await cache.get(input), null);
  assert.equal(calls, 2);
  assert.equal(observedErrors, 1);
  clock += 100;
  assert.equal(await cache.get(input), null);
  assert.equal(calls, 2);
  clock += 1001;
  failing = false;
  assert.equal((await cache.get(input)).get('light.living_room'), 'Living Room');
  assert.equal(calls, 3);
});
