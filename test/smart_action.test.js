import test from 'node:test';
import assert from 'node:assert/strict';
import * as Blockly from 'blockly';

import { setStudyRuntimeEntities } from '../src/data/entities_index.js';
import { createToolbox } from '../src/toolbox.js';
import { getBlockSearchResults } from '../src/block_search_flyout.js';
import { actionEntityBlocks, actionSmartBlocks, getSmartActionOptions } from '../src/blocks/action/action_entity.js';
import '../src/blocks/extensions.js';
import { yamlGenerator } from '../src/generators/yaml.js';

const ENTITIES = [
  { entity_id: 'light.living_room', attributes: { friendly_name: 'Living Room Light' } },
  { entity_id: 'switch.dehumidifier', attributes: { friendly_name: 'Dehumidifier' } },
  { entity_id: 'cover.bedroom_curtain', attributes: { friendly_name: 'Bedroom Curtain' } },
];
setStudyRuntimeEntities(ENTITIES);
Blockly.common.defineBlocks(actionEntityBlocks);
Blockly.common.defineBlocks(actionSmartBlocks);

const values = options => options.map(([, value]) => value);
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('new device action follows the selected Entity domain and emits matching YAML', async () => {
  const ws = new Blockly.Workspace();
  try {
    const block = ws.newBlock('action_smart');
    block.setFieldValue('light.living_room', 'ENTITY_ID');
    await tick();
    assert.ok(values(block.getField('ACTION').getOptions(false)).includes('turn_on'));
    assert.ok(!values(block.getField('ACTION').getOptions(false)).includes('open_cover'));
    block.setFieldValue('turn_on', 'ACTION');
    assert.match(yamlGenerator.blockToCode(block), /action: light\.turn_on/);

    block.setFieldValue('cover.bedroom_curtain', 'ENTITY_ID');
    await tick();
    assert.ok(values(block.getField('ACTION').getOptions(false)).includes('open_cover'));
    assert.ok(!values(block.getField('ACTION').getOptions(false)).includes('turn_on'));
    assert.equal(block.getFieldValue('ACTION'), 'open_cover');
    assert.match(yamlGenerator.blockToCode(block), /action: cover\.open_cover/);
    assert.match(yamlGenerator.blockToCode(block), /entity_id: cover\.bedroom_curtain/);

    block.setFieldValue('switch.dehumidifier', 'ENTITY_ID');
    await tick();
    assert.ok(values(block.getField('ACTION').getOptions(false)).includes('turn_on'));
    assert.match(yamlGenerator.blockToCode(block), /action: switch\.turn_on/);
  } finally {
    ws.dispose();
  }
});

test('original generic Home Assistant block remains unchanged for YAML round-trip', () => {
  const ws = new Blockly.Workspace();
  try {
    const original = ws.newBlock('action_homeassistant');
    original.setFieldValue('cover.bedroom_curtain', 'ENTITY_ID');
    original.setFieldValue('turn_on', 'ACTION');
    assert.match(yamlGenerator.blockToCode(original), /action: homeassistant\.turn_on/);
  } finally {
    ws.dispose();
  }
});

test('toolbox and Block Search expose device Action, not legacy homeassistant Action', () => {
  const action = createToolbox(ENTITIES).contents.find(x => x.name === 'Action');
  const types = action.contents.filter(x => x.kind === 'block').map(x => x.type);
  assert.ok(types.includes('action_smart'));
  assert.ok(types.includes('action_cover'));
  assert.ok(types.includes('action_switch'));
  assert.ok(!types.includes('action_homeassistant'));
  const results = getBlockSearchResults('homeassistant');
  assert.ok(!results.some(x => x.type === 'action_homeassistant'));
});

test('generic invalid domain-action combination cannot be emitted by device block', () => {
  assert.deepEqual(values(getSmartActionOptions('cover.bedroom_curtain')),
    ['open_cover', 'close_cover', 'stop_cover', 'toggle', 'set_cover_position']);
});
