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
      tooltip: 'Displays unsupported trigger YAML as-is. This block is read-only.',
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
      tooltip: 'Displays unsupported condition YAML as-is. This block is read-only.',
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
      tooltip: 'Displays unsupported action YAML as-is. This block is read-only.',
      helpUrl: '',
    },
  ]);
