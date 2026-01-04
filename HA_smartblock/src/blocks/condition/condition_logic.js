//src/blocks/condition/condition_logic.js
import * as Blockly from 'blockly';

export const conditionLogicBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
    { "type": "condition_logic",
      "message0": "%1",
      "args0": [ { "type": "field_dropdown", "name": "LOGIC",
        "options": [ ["and", "AND"], ["or", "OR"], ["not", "NOT"] ] } ],
      "message1": "%1",
      "args1": [ { "type": "input_statement", "name": "SUBCONDITIONS", "check": ["RULE_PART", "HA_CONDITION"] } ],
      "previousStatement": "HA_CONDITION",
      "nextStatement": "HA_CONDITION",
      "colour": "#AECA3E",
      "tooltip": "조건들을 and/or로 묶습니다.",
      "helpUrl": ""
    }
  ]);
