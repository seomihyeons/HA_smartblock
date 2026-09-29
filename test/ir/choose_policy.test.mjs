import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateChooseTypedRepresentability } from '../../src/import/choose_policy.mjs';
import { compareSemantic } from '../task_alt/semantic_compare.js';

const staticSwitchChoose = {
  choose: [{
    conditions: [{
      condition: 'state',
      entity_id: 'input_boolean.enabled',
      state: 'on',
    }],
    sequence: [{
      action: 'switch.turn_on',
      entity_id: 'switch.lamp',
    }],
  }],
};

test('only a fully static, single-branch choose is eligible for typed if conversion', () => {
  assert.equal(evaluateChooseTypedRepresentability(staticSwitchChoose).eligible, true);

  const multiBranch = structuredClone(staticSwitchChoose);
  multiBranch.choose.push(structuredClone(multiBranch.choose[0]));
  assert.equal(evaluateChooseTypedRepresentability(multiBranch).eligible, false);

  const templated = structuredClone(staticSwitchChoose);
  templated.choose[0].conditions = "{{ states('input_boolean.enabled') == 'on' }}";
  assert.equal(evaluateChooseTypedRepresentability(templated).eligible, false);

  const unsupportedService = structuredClone(staticSwitchChoose);
  unsupportedService.choose[0].sequence[0].action = 'light.toggle';
  unsupportedService.choose[0].sequence[0].entity_id = 'light.lamp';
  assert.equal(evaluateChooseTypedRepresentability(unsupportedService).eligible, false);
});

test('semantic comparison treats metadata and complex actions as meaningful', () => {
  const original = {
    alias: 'Example',
    variables: { sleep_mode: "{{ states('input_select.sleep_mode') }}" },
    mode: 'parallel',
    triggers: [],
    conditions: [],
    actions: [staticSwitchChoose],
  };
  const missingMetadataAndChoose = {
    alias: 'Example', triggers: [], conditions: [], actions: [],
  };

  assert.equal(compareSemantic(original, missingMetadataAndChoose).semanticEqual, false);
  assert.equal(compareSemantic(original, structuredClone(original)).semanticEqual, true);
});
