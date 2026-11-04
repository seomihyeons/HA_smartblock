import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../src/icons/block_filled_icons.js', import.meta.url), 'utf8',
);

test('leading icons use the dedicated Blockly field before flyout blocks initialize', () => {
  assert.match(source, /import \{ HaLeadingIconField \}/);
  assert.match(source, /new HaLeadingIconField\(/);
  assert.match(source, /for \(const definition of Object\.values\(Blockly\.Blocks\)\)/);
});

test('leading icon positioning never depends on render geometry or workspace events', () => {
  assert.doesNotMatch(source, /Blockly\.Events\.BLOCK_MOVE/);
  assert.doesNotMatch(source, /requestAnimationFrame\(/);
  assert.doesNotMatch(source, /getBoundingClientRect/);
  assert.doesNotMatch(source, /getScreenCTM/);
  assert.doesNotMatch(source, /BlockSvg\.prototype\.render/);
  assert.doesNotMatch(source, /VerticalFlyout\.prototype\.show/);
});

test('icon is still presentation-only and follows selected configuration', () => {
  assert.match(source, /new HaLeadingIconField\(/);
  assert.match(source, /function updateFilled\(block\)/);
  assert.match(source, /field\.setValue\(next\)/);
  assert.match(source, /updateFilled\(block\)/);
});

test('all three surfaces use the same field and current dropdown icons', () => {
  assert.match(source, /enhanceBlockEntityIcons\(this\)/);
  assert.match(source, /insertFilledField\(this\)/);
  assert.doesNotMatch(source, /Blockly\.Events\.BLOCK_MOVE/);
});
