// src/custom_theme.js
import * as Blockly from 'blockly';

/** 1) 테마 정의: 카테고리/블록 색상 일괄 관리 */
export const customTheme = Blockly.Theme.defineTheme('customTheme', {
  base: Blockly.Themes.Classic,
  categoryStyles: {
    rule_category:      { colour: '#3B4574' }, // Rule
    event_category:     { colour: '#7CB4B4' }, // Event
    condition_category: { colour: '#AECA3E' }, // Condition
    action_category:    { colour: '#E3CC57' }, // Action
  },
  blockStyles: {
    rule_blocks:      { colourPrimary: '#3B4574' },
    event_blocks:     { colourPrimary: '#7CB4B4' },
    condition_blocks: { colourPrimary: '#AECA3E' },
    action_blocks:    { colourPrimary: '#E3CC57' },
  },
});
