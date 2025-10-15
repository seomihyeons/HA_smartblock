// src/blocks/event_for.js
import * as Blockly from 'blockly';

export const eventForBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
    {
      "type": "ha_event_for_hms",
      "message0": "for %1 : %2 : %3",
      "args0": [
        { "type": "field_input", "name": "H", "text": "00" },
        { "type": "field_input", "name": "M", "text": "00" },
        { "type": "field_input", "name": "S", "text": "00" }
      ],
      "output": "DURATION",
      "colour": 180,
      "tooltip": "HH:MM:SS 형태의 duration을 생성합니다."
    }
  ]);