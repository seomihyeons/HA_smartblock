import test from 'node:test';
import assert from 'node:assert/strict';

import {
  capabilityForService,
  createCapabilityRegistry,
  isServiceCompatibleWithEntity,
  publicCapabilityContext,
  scopeCapabilityContext,
  servicesForEntityDomain,
} from '../capability_registry.mjs';

test('registry derives multi-domain visual services from the Blockly domain spec', () => {
  const registry = createCapabilityRegistry();
  assert.ok(registry.services.length > 20);
  assert.ok(servicesForEntityDomain('light', registry).includes('light.turn_on'));
  assert.ok(servicesForEntityDomain('switch', registry).includes('switch.toggle'));
  assert.ok(servicesForEntityDomain('climate', registry).includes('climate.set_temperature'));
  assert.ok(servicesForEntityDomain('cover', registry).includes('cover.open_cover'));
  assert.ok(servicesForEntityDomain('media_player', registry).includes('media_player.media_play'));
});

test('request scope keeps relevant entity services instead of the full HA catalog', () => {
  const context = publicCapabilityContext(createCapabilityRegistry());
  const scoped = scopeCapabilityContext(context, [{
    entity_id: 'switch.coffee',
    supported_actions: ['switch.turn_on', 'switch.turn_off'],
  }]);
  assert.ok(scoped.services.some(({ id }) => id === 'switch.turn_on'));
  assert.equal(scoped.services.some(({ id }) => id === 'climate.set_temperature'), false);
});

test('live Home Assistant service catalog limits unavailable capabilities and supplies metadata', () => {
  const registry = createCapabilityRegistry({
    serviceCatalog: [{
      domain: 'switch',
      services: {
        turn_on: {
          name: 'Turn on',
          description: 'Turns a switch on.',
          fields: {},
        },
      },
    }],
  });

  assert.deepEqual(servicesForEntityDomain('switch', registry), ['switch.turn_on']);
  assert.equal(capabilityForService('switch.turn_on', registry).description, 'Turns a switch on.');
  assert.equal(capabilityForService('switch.toggle', registry).available_in_home, false);
});

test('risk and entity compatibility are capability properties rather than language categories', () => {
  const registry = createCapabilityRegistry();
  assert.equal(capabilityForService('lock.unlock', registry).risk, 'high');
  assert.equal(capabilityForService('light.turn_off', registry).risk, 'low');
  assert.equal(isServiceCompatibleWithEntity('climate.set_temperature', 'climate.hall', registry), true);
  assert.equal(isServiceCompatibleWithEntity('climate.set_temperature', 'light.hall', registry), false);
});

test('public context exposes bounded visual capabilities without implementation functions', () => {
  const context = publicCapabilityContext(createCapabilityRegistry());
  assert.ok(context.trigger_kinds.includes('numeric_state'));
  assert.ok(context.condition_kinds.includes('and'));
  assert.ok(context.services.some((service) => service.id === 'fan.set_percentage'));
  assert.equal(JSON.stringify(context).includes('serviceMap'), false);
});
