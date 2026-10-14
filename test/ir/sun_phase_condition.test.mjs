import assert from 'node:assert/strict';
import test from 'node:test';
import * as Blockly from 'blockly';

import { conditionSunBlocks } from '../../src/blocks/condition/condition_sun.js';
import { yamlGenerator } from '../../src/generators/yaml.js';
import { createConditionsRoot } from '../../src/import/blocks/condition_mapper.js';

Blockly.common.defineBlocks(conditionSunBlocks);

const PHASES = [
  'sun.is_night',
  'sun.is_polar_night',
  'sun.is_midnight_sun',
];

test('sun phase condition generates each supported Home Assistant condition', () => {
  const workspace = new Blockly.Workspace();
  const block = workspace.newBlock('condition_sun_phase');

  for (const phase of PHASES) {
    block.setFieldValue(phase, 'PHASE');
    assert.equal(yamlGenerator.blockToCode(block), `- condition: ${phase}\n`);
  }

  workspace.dispose();
});

test('sun phase conditions import as a typed block rather than raw fallback', () => {
  for (const phase of PHASES) {
    const workspace = new Blockly.Workspace();
    const block = createConditionsRoot([{ condition: phase }], workspace);

    assert.equal(block?.type, 'condition_sun_phase');
    assert.equal(block?.getFieldValue('PHASE'), phase);
    assert.equal(yamlGenerator.blockToCode(block), `- condition: ${phase}\n`);
    workspace.dispose();
  }
});
