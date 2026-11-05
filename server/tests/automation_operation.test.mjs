import assert from 'node:assert/strict';
import test from 'node:test';
import { automationOperationFor } from '../../src/homeassistant/llm_assistant/automation_operation.mjs';

test('RuleBot-style modification is not misclassified by an embedded check condition', () => {
  const command = 'Modify the air quality automation we created earlier. Before turning on the air purifier, also check whether someone is present in the bedroom.';
  assert.equal(automationOperationFor(command, true), 'modify');
});
test('checks of existing automation remain read-only inspections', () => {
  assert.equal(automationOperationFor('Check this automation for problems', true), 'inspect');
  assert.equal(automationOperationFor('Inspect current blocks', true), 'inspect');
});
test('explanation requests are read-only', () => {
  assert.equal(automationOperationFor('Explain this automation', true), 'explain');
});
test('explicit modifications beat an embedded inspection verb', () => {
  assert.equal(automationOperationFor('Check this automation and modify the time condition', true), 'modify');
});
test('new automation creation wins over a selected prior draft', () => {
  assert.equal(automationOperationFor('Create an automation that checks motion and turns on the light', true), 'create');
});
test('Korean modification, inspection and explanation use the same operations', () => {
  assert.equal(automationOperationFor('이전 자동화에 조건을 추가해줘', true), 'modify');
  assert.equal(automationOperationFor('현재 자동화 검사해줘', true), 'inspect');
  assert.equal(automationOperationFor('이 자동화 설명해줘', true), 'explain');
});


test('refines an existing automation using natural follow-up language', () => {
  assert.equal(automationOperationFor('Make it more relaxing.', true), 'modify');
  assert.equal(automationOperationFor('Also turn off the hallway light.', true), 'modify');
  assert.equal(automationOperationFor('좀 더 편안한 분위기로 해줘.', true), 'modify');
});

test('does not infer edits without a selected automation', () => {
  assert.equal(automationOperationFor('Make it more relaxing.', false), 'create');
});

test('explicit new automation is not silently treated as an edit', () => {
  assert.equal(automationOperationFor('Create a new automation for guests.', true), 'create');
});

test('read-only requests and direct control remain distinct from refinement', () => {
  assert.equal(automationOperationFor('Explain what this automation does.', true), 'explain');
  assert.equal(automationOperationFor('Turn off the hallway light.', true), 'create');
  assert.equal(automationOperationFor('Is the hallway light on?', true), 'create');
  assert.equal(automationOperationFor("And what's the bedroom light state?", true), 'create');
  assert.equal(automationOperationFor('그리고 거실 조명 상태 알려줘', true), 'create');
  assert.equal(automationOperationFor('Also turn off the hallway light now.', true), 'create');
});
