// src/blocks/action_delay.js
import * as Blockly from 'blockly';

export const actionDelayBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
    {
      "type": "action_delay",
      "message0": "delay %1 : %2 : %3",
      "args0": [
        { "type": "field_input", "name": "H", "text": "00" },
        { "type": "field_input", "name": "M", "text": "00" },
        { "type": "field_input", "name": "S", "text": "00" }
      ],
      "previousStatement": "HA_ACTION",
      "nextStatement": "HA_ACTION",
      "colour": "E3CC57",
      "tooltip": "Waits for the specified duration before running the next action."
    }
  ]);
