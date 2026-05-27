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
    "tooltip": "Runs the THEN actions when the condition is true, otherwise runs the ELSE actions.",
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
    "tooltip": "Runs the THEN actions only when the condition is true. Otherwise, execution continues to the next action.",
    "helpUrl": ""
  }
]);
