import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../src/icons/block_filled_icons.js', import.meta.url), 'utf8',
);

test('render-time alignment is installed before flyout blocks are initialized', () => {
  assert.match(source, /function installRenderAlignment\(/);
  assert.match(source, /installRenderAlignment\(\);\s*for \(const definition/);
  assert.match(source, /prototype\.render = function/);
  assert.match(source, /originalRender\.apply\(this, args\)/);
  assert.match(source, /centerFilledIconDuringRender\(this\)/);
});

test('leading icon positioning never depends on BLOCK_MOVE or animation frames', () => {
  assert.doesNotMatch(source, /Blockly\.Events\.BLOCK_MOVE/);
  assert.doesNotMatch(source, /requestAnimationFrame\(/);
});

test('icon is still presentation-only and follows selected configuration', () => {
  assert.match(source, /field\.SERIALIZABLE = false/);
  assert.match(source, /updateFilled\(this\)/);
  assert.match(source, /insertFilledField\(this\)/);
});

test('all three surfaces use prepaint vertical center alignment and current dropdown icons', () => {
  assert.match(source, /enhanceBlockEntityIcons\(this\)/);
  assert.match(source, /prototype\.render = function/);
  assert.match(source, /flyoutPrototype\.show = function/);
  assert.match(source, /originalShow\.apply\(this, args\)/);
  assert.match(source, /centerFilledIconDuringRender\(block\)/);
  assert.match(source, /getScreenCTM\?\.\(\)/);
  assert.doesNotMatch(source, /Blockly\.Events\.BLOCK_MOVE/);
});
