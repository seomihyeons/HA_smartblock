import assert from 'node:assert/strict';
import test from 'node:test';

import { filterAutomations } from '../../src/homeassistant/automation_search.js';

const automations = [
  { id: 'morning_lights', name: 'Morning Lights' },
  { id: 'bedroom_curtain', name: 'Bedroom Curtain' },
  { id: 'door_alert', name: 'Front Door Alert' },
];

test('automation search matches aliases and IDs without case sensitivity', () => {
  assert.deepEqual(
    filterAutomations(automations, 'MORNING').map((item) => item.id),
    ['morning_lights']
  );
  assert.deepEqual(
    filterAutomations(automations, 'CURTAIN').map((item) => item.id),
    ['bedroom_curtain']
  );
  assert.deepEqual(
    filterAutomations(automations, 'DOOR_ALERT').map((item) => item.id),
    ['door_alert']
  );
});

test('clearing the automation search restores the original list and no match is empty', () => {
  assert.deepEqual(filterAutomations(automations, '').map((item) => item.id), automations.map((item) => item.id));
  assert.deepEqual(filterAutomations(automations, 'not-present'), []);
});
