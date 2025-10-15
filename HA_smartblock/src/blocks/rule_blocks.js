// src/blocks/rule_blocks.js

import * as Blockly from 'blockly';

export const ruleBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
    // Event-Action (EA) Block
    {
      "type": "event_action",
      "message0": "Name %1 ID %2", 
      "args0": [ 
        { "type": "field_input", "name": "ALIAS", "text": "New Automation" }, 
        { "type": "field_input", "name": "ID", "text": "(Optional)" }
      ],
      "message1": "Event %1", "args1": [ { "type": "input_statement", "name": "EVENT", "check": "HA_EVENT" } ],
      "message2": "Action %1", "args2": [ { "type": "input_statement", "name": "ACTION", "check": "HA_ACTION" } ],
      "colour": "3B4574","tooltip": "Event / Action을 묶는 컨테이너",
      "helpUrl": ""
    },

    // Event-Condition-Action (ECA) Block
    {
      "type": "event_condition_action",
      "message0": "Name %1 ID %2", 
      "args0": [ 
        { "type": "field_input", "name": "ALIAS", "text": "New Automation" },
        { "type": "field_input", "name": "ID", "text": "(Optional)" }
      ],
      "message1": "Event %1", "args1": [ { "type": "input_statement", "name": "EVENT", "check": "HA_EVENT" } ],
      "message2": "Condition %1", "args2": [ { "type": "input_statement", "name": "CONDITION", "check": "HA_CONDITION" } ],
      "message3": "Action %1", "args3": [ { "type": "input_statement", "name": "ACTION", "check": "HA_ACTION"} ],
      "colour": "3B4574",
      "tooltip": "Event / Condition / Action을 묶는 컨테이너",
      "helpUrl": ""
    }
  ]);