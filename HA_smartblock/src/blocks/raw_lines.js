// src/blocks/raw_lines.js
import * as Blockly from 'blockly';

export const rawLinesBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
    {
      type: 'ha_event_raw_lines',
      message0: '%1',
      args0: [
        { type: 'field_label_serializable', name: 'RAW_LINES', text: '' },
      ],
      previousStatement: 'HA_EVENT',
      nextStatement: 'HA_EVENT',
      colour: 180,
      tooltip: '구현되지 않은 trigger YAML을 원문 그대로 표시합니다(수정 불가).',
      helpUrl: '',
    },
    {
      type: 'ha_condition_raw_lines',
      message0: '%1',
      args0: [
        { type: 'field_label_serializable', name: 'RAW_LINES', text: '' },
      ],
      previousStatement: 'HA_CONDITION',
      nextStatement: 'HA_CONDITION',
      colour: "AECA3E",
      tooltip: '구현되지 않은 condition YAML을 원문 그대로 표시합니다(수정 불가).',
      helpUrl: '',
    },
    {
      type: 'ha_action_raw_lines',
      message0: '%1',
      args0: [
        { type: 'field_label_serializable', name: 'RAW_LINES', text: '' },
      ],
      previousStatement: 'HA_ACTION',
      nextStatement: 'HA_ACTION',
      colour: "E3CC57",
      tooltip: '구현되지 않은 action YAML을 원문 그대로 표시합니다(수정 불가).',
      helpUrl: '',
    },
  ]);
