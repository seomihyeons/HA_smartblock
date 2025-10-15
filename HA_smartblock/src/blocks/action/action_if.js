// src/blocks/action_if.js
import * as Blockly from 'blockly';

export const actionIfBlocks = Blockly.common.createBlockDefinitionsFromJsonArray([
  {
    "type": "action_if_else",
    "message0": "if %1 then %2 else %3",
    "args0": [
      { "type": "input_statement", "name": "IF", "check": "HA_CONDITION" },
      { "type": "input_statement", "name": "THEN", "check": "HA_ACTION" },
      { "type": "input_statement", "name": "ELSE", "check": "HA_ACTION" }
    ],
    "colour": "#E3CC57",
    "previousStatement": 'HA_ACTION',
    "nextStatement": 'HA_ACTION',
    "tooltip": "조건이 참이면 THEN 동작을, 거짓이면 ELSE 동작을 실행합니다.",
    "helpUrl": ""
  },
  {
    "type": "action_if_then",
    "message0": "if %1 then %2",
    "args0": [
      { "type": "input_statement", "name": "IF", "check": "HA_CONDITION" },
      { "type": "input_statement", "name": "THEN", "check": "HA_ACTION" },
    ],
    "previousStatement": 'HA_ACTION',
    "nextStatement": 'HA_ACTION',
    "colour": "#E3CC57",
    "tooltip": "조건이 참일 때만 THEN 동작을 실행합니다. 거짓이면 다음 액션으로 넘어갑니다.",
    "helpUrl": ""
  }
]);
