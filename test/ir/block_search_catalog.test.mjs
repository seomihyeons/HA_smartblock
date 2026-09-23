import assert from 'node:assert/strict';
import test from 'node:test';

import { getBlockSearchResults } from '../../src/block_search_flyout.js';

const typesFor = (query) => getBlockSearchResults(query).map(({ type }) => type);

test('beginner search terms return the expected block families', () => {
  const cases = [
    ['light', ['event_light_state', 'condition_state_light', 'action_light']],
    ['turn on', [
      'action_light',
      'action_switch',
      'action_climate',
      'action_fan',
      'action_input_boolean',
      'action_automation',
      'action_homeassistant',
      'action_group',
      'action_humidifier',
    ]],
    ['sensor', [
      'event_binary_sensor_state',
      'event_sensor_numeric_state',
      'condition_state_binary_sensor',
      'condition_state_sensor',
    ]],
    ['door', [
      'event_binary_sensor_state',
      'condition_state_binary_sensor',
      'action_lock',
      'action_cover',
    ]],
    ['time', [
      'ha_event_time_state',
      'ha_event_time_pattern',
      'ha_event_for_hms',
      'condition_time',
      'condition_time_weekly',
    ]],
    ['delay', ['action_delay']],
  ];

  for (const [query, expected] of cases) {
    assert.deepEqual(typesFor(query), expected, query);
  }
});

test('logic and notification queries avoid substring false positives', () => {
  assert.deepEqual(typesFor('OR'), ['condition_logic']);
  assert.deepEqual(typesFor('notify'), [
    'action_notify',
    'action_notify_message_text',
    'action_notify_message_template',
    'action_notify_tag',
    'notify_tag',
    'notify_action',
    'notify_prop_title',
    'notify_prop_destructive',
    'notify_prop_activationMode',
    'notify_push_option',
  ]);
});

test('condition search exposes the condition rule and condition blocks', () => {
  const types = typesFor('condition');
  assert.equal(types[0], 'event_condition_action');
  assert.ok(types.includes('condition_logic'));
  assert.ok(types.includes('condition_time'));
  assert.ok(types.includes('condition_state_light'));
});
