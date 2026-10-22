import assert from 'node:assert/strict';
import test from 'node:test';
import * as Blockly from 'blockly';
import { load as parseYaml } from 'js-yaml';

import { conditionZoneBlocks } from '../../src/blocks/condition/condition_zone.js';
import { rawLinesBlocks } from '../../src/blocks/raw_lines.js';
import { setFixtureEntities } from './entity_fixture.mjs';
import { yamlGenerator } from '../../src/generators/yaml.js';
import { createConditionsRoot } from '../../src/import/blocks/condition_mapper.js';

Blockly.common.defineBlocks(conditionZoneBlocks);
Blockly.common.defineBlocks(rawLinesBlocks);

function loadZoneStudyEntities() {
  setFixtureEntities([
    {
      entity_id: 'person.test_user',
      state: 'home',
      attributes: { friendly_name: 'Test User' },
    },
    {
      entity_id: 'zone.home',
      state: '1',
      attributes: { friendly_name: 'Home' },
    },
    {
      entity_id: 'person.other_user',
      state: 'not_home',
      attributes: { friendly_name: 'Other User' },
    },
    {
      entity_id: 'zone.work',
      state: '0',
      attributes: { friendly_name: 'Work' },
    },
  ]);
}

const yamlFor = (condition) => [
  `- condition: ${condition}`,
  '  target:',
  '    entity_id: person.test_user',
  '  options:',
  '    zone: zone.home',
  '',
].join('\n');

test('zone membership block generates the current Home Assistant in/not-in zone conditions', () => {
  loadZoneStudyEntities();
  const workspace = new Blockly.Workspace();
  const block = workspace.newBlock('condition_zone_membership');

  assert.deepEqual(block.getField('USER').getOptions(false), [['Test User', 'person.test_user'], ['Other User', 'person.other_user']]);
  assert.deepEqual(block.getField('ZONE').getOptions(false), [['Home', 'zone.home'], ['Work', 'zone.work']]);

  for (const condition of ['zone.in_zone', 'zone.not_in_zone']) {
    block.setFieldValue(condition, 'MEMBERSHIP');
    assert.equal(yamlGenerator.blockToCode(block), yamlFor(condition));
  }
  workspace.dispose();
});

test('current zone conditions import to the same typed block and round-trip', () => {
  loadZoneStudyEntities();
  for (const condition of ['zone.in_zone', 'zone.not_in_zone']) {
    const workspace = new Blockly.Workspace();
    const block = createConditionsRoot([{
      condition,
      target: { entity_id: 'person.test_user' },
      options: { zone: 'zone.home' },
    }], workspace);

    assert.equal(block?.type, 'condition_zone_membership');
    assert.equal(block?.getFieldValue('USER'), 'person.test_user');
    assert.equal(block?.getFieldValue('MEMBERSHIP'), condition);
    assert.equal(block?.getFieldValue('ZONE'), 'zone.home');
    assert.equal(yamlGenerator.blockToCode(block), yamlFor(condition));
    workspace.dispose();
  }
});

test('zone conditions with unsupported options remain raw', () => {
  loadZoneStudyEntities();
  const workspace = new Blockly.Workspace();
  const block = createConditionsRoot([{
    condition: 'zone.in_zone',
    target: { entity_id: 'person.test_user' },
    options: { zone: 'zone.home', behavior: 'all' },
  }], workspace);

  assert.equal(block?.type, 'ha_condition_raw_lines');
  workspace.dispose();
});

test('missing catalog zones preserve imported in/not-in conditions as Raw YAML', () => {
  setFixtureEntities([
    { entity_id: 'person.test_user', state: 'home', attributes: { friendly_name: 'Test User' } },
  ]);
  for (const condition of ['zone.in_zone', 'zone.not_in_zone']) {
    const input = {
      condition,
      target: { entity_id: 'person.test_user' },
      options: { zone: 'zone.unlisted_zone' },
    };
    const workspace = new Blockly.Workspace();
    try {
      const block = createConditionsRoot([input], workspace);
      assert.equal(block.type, 'ha_condition_raw_lines');
      assert.deepEqual(parseYaml(yamlGenerator.blockToCode(block)), [input]);
    } finally {
      workspace.dispose();
    }
  }
});

test('legacy zone YAML survives import/export when the zone is absent from the catalog', () => {
  setFixtureEntities([]);
  const input = { condition: 'zone', entity_id: 'person.saved_user', zone: 'zone.unlisted_zone' };
  const workspace = new Blockly.Workspace();
  try {
    const block = createConditionsRoot([input], workspace);
    assert.equal(block.type, 'ha_condition_raw_lines');
    assert.deepEqual(parseYaml(yamlGenerator.blockToCode(block)), [input]);
  } finally {
    workspace.dispose();
  }
});
