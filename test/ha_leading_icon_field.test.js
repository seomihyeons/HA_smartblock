import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../src/icons/ha_leading_icon_field.js', import.meta.url), 'utf8',
);

test('leading icon is a fixed-size Blockly field, not a post-render adjustment', () => {
  assert.match(source, /class HaLeadingIconField extends Blockly\.FieldImage/);
  assert.match(source, /const ICON_SIZE = 18/);
  assert.match(source, /const FIELD_HEIGHT = 24/);
  assert.match(source, /this\.SERIALIZABLE = false/);
  assert.match(source, /this\.size_\.height = FIELD_HEIGHT/);
  assert.match(source, /this\.imageElement\?\.setAttribute\('y', String\(IMAGE_TOP\)\)/);
  assert.doesNotMatch(source, /getBoundingClientRect/);
  assert.doesNotMatch(source, /getScreenCTM/);
});
