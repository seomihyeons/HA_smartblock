// src/blocks/action/action_data.js
import * as Blockly from 'blockly';

export const actionDataBlocks = Blockly.common.createBlockDefinitionsFromJsonArray([
  // light.turn_on에서 자주 쓰는 옵션
  {
    type: 'action_data_brightness_pct',
    message0: 'brightness_pct %1',
    args0: [
      { type: 'field_number', name: 'VALUE', value: 100, min: 0, max: 100, precision: 1 },
    ],
    previousStatement: 'HA_ACTION_DATA',
    nextStatement: 'HA_ACTION_DATA',
    colour: '#E3CC57',
    tooltip: '0~100 밝기 퍼센트',
    helpUrl: '',
  },

  {
    type: 'action_data_transition',
    message0: 'transition %1 sec',
    args0: [
      { type: 'field_number', name: 'SECONDS', value: 0, min: 0, precision: 1 },
    ],
    previousStatement: 'HA_ACTION_DATA',
    nextStatement: 'HA_ACTION_DATA',
    colour: '#E3CC57',
    tooltip: '전환 시간(초)',
    helpUrl: '',
  },

  // 범용: key/value 하나 찍는 블록 (나중에 확장할 때 유용)
  {
    type: 'action_data_kv_text',
    message0: '%1 : %2',
    args0: [
      { type: 'field_input', name: 'KEY', text: 'key', spellcheck: true },
      { type: 'field_input', name: 'VALUE', text: 'value', spellcheck: true },
    ],
    previousStatement: 'HA_ACTION_DATA',
    nextStatement: 'HA_ACTION_DATA',
    colour: '#E3CC57',
    tooltip: 'data 아래에 key: value(문자열) 추가',
    helpUrl: '',
  },
]);
