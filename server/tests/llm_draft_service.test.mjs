import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEntityCards,
  createFakeAutomationDraft,
  validateDraft,
} from '../llm_draft_service.mjs';

const baseCards = [
  {
    entity_id: 'binary_sensor.entrance_motion',
    friendly_name: '현관 움직임',
    domain: 'binary_sensor',
    state: 'off',
    device_class: 'motion',
    area: '현관',
  },
  {
    entity_id: 'light.living_room_mood',
    friendly_name: '거실 무드램프',
    domain: 'light',
    state: 'off',
    area: '거실',
    supported_actions: ['light.turn_on', 'light.turn_off'],
  },
];

test('buildEntityCards keeps a compact allowlisted state representation', () => {
  const cards = buildEntityCards([{
    entity_id: 'light.living_room',
    state: 'on',
    attributes: {
      friendly_name: '거실 조명',
      supported_color_modes: ['brightness', 'color_temp'],
      access_token: 'must-not-leak',
    },
  }]);

  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0].capabilities, ['brightness', 'color_temp']);
  assert.deepEqual(cards[0].supported_actions, ['light.turn_on', 'light.turn_off']);
  assert.equal(Object.hasOwn(cards[0], 'access_token'), false);
});

test('buildEntityCards derives actions for non-light domains from the shared capability registry', () => {
  const cards = buildEntityCards([{
    entity_id: 'climate.living_room',
    state: 'cool',
    attributes: {
      friendly_name: 'Living Room Thermostat',
      min_temp: 7,
      max_temp: 35,
      hvac_modes: ['off', 'heat', 'cool'],
      access_token: 'must-not-leak',
    },
  }]);

  assert.ok(cards[0].supported_actions.includes('climate.set_temperature'));
  assert.deepEqual(cards[0].capability_attributes.hvac_modes, ['off', 'heat', 'cool']);
  assert.equal(cards[0].capability_attributes.min_temp, 7);
  assert.equal(Object.hasOwn(cards[0].capability_attributes, 'access_token'), false);
});

test('fake provider creates a grounded motion-to-light draft', () => {
  const result = createFakeAutomationDraft({
    command: '현관 움직임이 감지되면 거실 무드램프를 켜줘',
    entity_cards: baseCards,
  });

  assert.equal(result.status, 'success');
  assert.equal(result.automation.triggers[0].entity_id[0], 'binary_sensor.entrance_motion');
  assert.equal(result.automation.actions[0].target.entity_id[0], 'light.living_room_mood');
  assert.deepEqual(result.validation.errors, []);
});

test('fake provider asks for confirmation when light candidates tie', () => {
  const result = createFakeAutomationDraft({
    command: '움직임이 감지되면 조명을 켜줘',
    entity_cards: [
      baseCards[0],
      { ...baseCards[1], entity_id: 'light.living_room', friendly_name: '거실 조명' },
      { ...baseCards[1], entity_id: 'light.bedroom', friendly_name: '침실 조명', area: '침실' },
    ],
  });

  assert.equal(result.status, 'needs_confirmation');
  assert.equal(result.role, 'action');
  assert.equal(result.candidates.length, 2);
});

test('validator rejects an entity outside the supplied context', () => {
  const validation = validateDraft({
    triggers: [{ entity_id: ['binary_sensor.entrance_motion'] }],
    actions: [{
      action: 'light.turn_on',
      target: { entity_id: ['light.hallucinated'] },
    }],
  }, baseCards);

  assert.equal(validation.grounded, false);
  assert.match(validation.errors.join('\n'), /Unknown entity at actions\[0\]\.target\.entity_id/);
});

test('validator applies the shared automation IR schema first', () => {
  const validation = validateDraft({
    triggers: {},
    conditions: [],
    actions: [],
  }, baseCards);

  assert.equal(validation.schema_valid, false);
  assert.equal(validation.schema_version, 1);
  assert.match(validation.errors.join('\n'), /triggers must be an array/);
});

test('validator accepts multi-domain visual IR without domain-specific routing', () => {
  const cards = [
    ...baseCards,
    {
      entity_id: 'switch.coffee_maker',
      friendly_name: 'Coffee Maker',
      domain: 'switch',
      supported_actions: ['switch.turn_on', 'switch.turn_off'],
    },
    {
      entity_id: 'climate.bedroom',
      friendly_name: 'Bedroom Thermostat',
      domain: 'climate',
      supported_actions: ['climate.set_temperature'],
    },
  ];
  const validation = validateDraft({
    alias: 'Morning preparation',
    triggers: [{ platform: 'time', at: '07:00:00' }],
    conditions: [{
      condition: 'state',
      entity_id: ['binary_sensor.entrance_motion'],
      state: 'off',
    }],
    actions: [
      { service: 'switch.turn_on', target: { entity_id: ['switch.coffee_maker'] }, data: {} },
      { delay: '00:00:05' },
      {
        choose: [{
          conditions: [{
            condition: 'state',
            entity_id: ['binary_sensor.entrance_motion'],
            state: 'off',
          }],
          sequence: [{
            service: 'climate.set_temperature',
            target: { entity_id: ['climate.bedroom'] },
            data: { temperature: 22 },
          }],
        }],
        default: [],
      },
    ],
  }, cards, {
    allowed_services: ['switch.turn_on', 'climate.set_temperature'],
  });

  assert.deepEqual(validation.errors, []);
  assert.equal(validation.blockly_supported, true);
});

test('fake provider rejects requests outside the MVP scope', () => {
  const result = createFakeAutomationDraft({
    command: '내일 날씨를 알려줘',
    entity_cards: baseCards,
  });

  assert.equal(result.status, 'unsupported');
});
