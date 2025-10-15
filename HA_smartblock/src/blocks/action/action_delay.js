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
      "tooltip": "다음 동작을 실행하기 전, 지정된 시간 동안 기다리는 블럭입니다."
    }
  ]);