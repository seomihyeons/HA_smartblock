import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../src/blocks/rule_blocks.js', import.meta.url), 'utf8',
);

test('Rule section labels expose styled Home Assistant guidance on hover', () => {
  assert.match(source, /'When'/);
  assert.match(source, /'And if \(optional\)'/);
  assert.match(source, /'Then do'/);
  assert.match(source, /this\.setTooltip\(''\)/);
  assert.match(source, /ha-rule-section-tooltip/);
  assert.match(source, /RULE_TOOLTIP_DELAY_MS = 100/);
  assert.match(source, /RULE_TOOLTIP_HIDE_DELAY_MS = 100/);
  assert.match(source, /togglePinnedSectionTooltip_/);
  assert.match(source, /dismissPinnedTooltipOnOutsideClick_/);
  assert.match(source, /root\.addEventListener\('pointerleave'/);
  assert.doesNotMatch(source, /backgroundRect_\.addEventListener\('pointerleave'/);
  assert.match(source, /RULE_SECTION_TOOLTIPS\.trigger/);
  assert.match(source, /RULE_SECTION_TOOLTIPS\.condition/);
  assert.match(source, /RULE_SECTION_TOOLTIPS\.action/);
  assert.match(source, /'pointer-events': 'all'/);
  assert.match(source, /"tooltip": ""/);
});
