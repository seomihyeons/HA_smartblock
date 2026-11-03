// src/blocks/rule_blocks.js

import * as Blockly from 'blockly';

const RULE_LABEL_WIDTH = 88;
const RULE_LABEL_HEIGHT = 22;
const RULE_LABEL_PADDING_X = 8;

class RuleSectionLabelField extends Blockly.FieldLabel {
  constructor(text, colour) {
    super(text, 'ha-rule-section-label-text');
    this.colour_ = colour;
    this.backgroundRect_ = null;
  }

  initView() {
    super.initView();
    const root = this.getSvgRoot();
    if (!root || this.backgroundRect_) return;
    this.backgroundRect_ = Blockly.utils.dom.createSvgElement('rect', {
      x: 0, y: 0, width: RULE_LABEL_WIDTH, height: RULE_LABEL_HEIGHT,
      rx: 4, ry: 4, fill: this.colour_, 'pointer-events': 'none',
    }, root);
    root.insertBefore(this.backgroundRect_, this.getTextElement());
  }

  updateSize_() {
    super.updateSize_(0);
    const textWidth = this.size_.width;
    this.size_.width = RULE_LABEL_WIDTH;
    this.size_.height = RULE_LABEL_HEIGHT;
    this.positionTextElement_(RULE_LABEL_PADDING_X, textWidth);
    this.backgroundRect_?.setAttribute('width', String(RULE_LABEL_WIDTH));
    this.backgroundRect_?.setAttribute('height', String(RULE_LABEL_HEIGHT));
  }

  static fromJson(options) {
    return new RuleSectionLabelField(options.text || '', options.colour || '#ffffff');
  }
}

try {
  Blockly.fieldRegistry.register('field_ha_rule_section_label', RuleSectionLabelField);
} catch (error) {
  if (!String(error?.message || error).includes('already registered')) throw error;
}

export const ruleBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
    // Trigger-Action (TA) Block
    {
      "type": "event_action",
      "message0": "Name %1 ID %2", 
      "args0": [ 
        { "type": "field_input", "name": "ALIAS", "text": "New Automation" }, 
        { "type": "field_input", "name": "ID", "text": "(Optional)" }
      ],
      "message1": "%1 %2", "args1": [
        { "type": "field_ha_rule_section_label", "text": "Trigger", "colour": "#7CB4B4" },
        { "type": "input_statement", "name": "EVENT", "check": "HA_EVENT" }
      ],
      "message2": "%1 %2", "args2": [
        { "type": "field_ha_rule_section_label", "text": "Action", "colour": "#E3CC57" },
        { "type": "input_statement", "name": "ACTION", "check": "HA_ACTION" }
      ],
      "colour": "3B4574","tooltip": "Container block that groups Trigger and Action blocks.",
      "helpUrl": "",
      "mutator": "ha_rule_optional_metadata"
    },

    // Trigger-Condition-Action (TCA) Block
    {
      "type": "event_condition_action",
      "message0": "Name %1 ID %2", 
      "args0": [ 
        { "type": "field_input", "name": "ALIAS", "text": "New Automation" },
        { "type": "field_input", "name": "ID", "text": "(Optional)" }
      ],
    "message1": "%1 %2", "args1": [
        { "type": "field_ha_rule_section_label", "text": "Trigger", "colour": "#7CB4B4" },
        { "type": "input_statement", "name": "EVENT", "check": "HA_EVENT" }
      ],
    "message2": "%1 %2", "args2": [
        { "type": "field_ha_rule_section_label", "text": "Condition", "colour": "#AECA3E" },
        { "type": "input_statement", "name": "CONDITION", "check": "HA_CONDITION" }
      ],
    "message3": "%1 %2", "args3": [
        { "type": "field_ha_rule_section_label", "text": "Action", "colour": "#E3CC57" },
        { "type": "input_statement", "name": "ACTION", "check": "HA_ACTION"}
      ],
      "colour": "3B4574",
      "tooltip": "Container block that groups Trigger, Condition, and Action blocks.",
      "helpUrl": "",
      "mutator": "ha_rule_optional_metadata"
    }
  ]);
