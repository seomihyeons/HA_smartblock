import assert from 'node:assert/strict';
import test from 'node:test';
import { setRuntimeHomeAssistantEntities, setRuntimeNotifyServices } from '../../src/data/entities_index.js';
import { getNotifyTargetOptions } from '../../src/data/options.js';
import { capabilityForService, createCapabilityRegistry, servicesForEntityDomain } from '../capability_registry.mjs';

test('notification dropdown uses live HA entities and services, not scenario IDs', () => {
  setRuntimeHomeAssistantEntities([
    { entity_id: 'notify.family_member', state: 'unknown', attributes: { friendly_name: 'Family Member' } },
    { entity_id: 'light.hallway', state: 'off', attributes: {} },
  ]);
  setRuntimeNotifyServices([{ domain: 'notify', services: {
    send_message: {}, mobile_app_family_phone: {}, telegram_family: {},
  } }]);
  const values = getNotifyTargetOptions().map((entry) => entry[1]);
  assert.ok(values.includes('notify.family_member'));
  assert.ok(values.includes('mobile_app_family_phone'));
  assert.ok(values.includes('telegram_family'));
  assert.ok(!values.includes('notify.test_user'));
  assert.ok(!values.includes('USER1_devices'));
  assert.ok(!values.includes('send_message')); // requires a real notify entity
});

test('no live notify capability offers a disabled placeholder, not a fabricated service', () => {
  setRuntimeHomeAssistantEntities([{ entity_id: 'light.office', state: 'off', attributes: {} }]);
  setRuntimeNotifyServices([]);
  assert.deepEqual(getNotifyTargetOptions(), [['(No notification targets)', '__unavailable__']]);
});

test('notify entity and legacy service contracts remain distinct', () => {
  const registry = createCapabilityRegistry({ serviceCatalog: [{
    domain: 'notify', services: {
      send_message: { fields: { message: { required: true } }, target: {} },
      mobile_app_any_phone: { fields: { message: { required: true } } },
    },
  }] });
  assert.equal(capabilityForService('notify.send_message', registry).target_required, true);
  assert.equal(capabilityForService('notify.mobile_app_any_phone', registry).target_required, false);
  assert.deepEqual(servicesForEntityDomain('notify', registry), ['notify.send_message']);
});
