// src/blocks/rule_blocks.js

import * as Blockly from 'blockly';

const RULE_LABEL_WIDTH = 88;
const RULE_LABEL_HEIGHT = 22;
const RULE_LABEL_PADDING_X = 8;
const RULE_TOOLTIP_DELAY_MS = 100;
const RULE_TOOLTIP_HIDE_DELAY_MS = 100;
let activeRuleSectionTooltipField = null;
const RULE_SECTION_TOOLTIPS = Object.freeze({
  trigger: [
    'When',
    '',
    "A trigger is a specific event happening in or around your home, for example: 'When the sun sets'. Any trigger added here will start your automation.",
  ].join('\n'),
  condition: [
    'And if (optional)',
    '',
    "All conditions added here need to be satisfied for the automation to run. A condition can be satisfied or not at any given time, for example: 'If Test User is home'. You can use building blocks to create more complex conditions.",
  ].join('\n'),
  action: [
    'Then do',
    '',
    "All actions added here will be performed in sequence when the automation runs. An action usually controls one of your areas, devices, or entities, for example: 'Turn on the lights'. You can use building blocks to create more complex sequences of actions.",
  ].join('\n'),
});

// This Field owns only its small SVG group. It does not draw over Blockly's
// Rule outline or Statement Input notch, so connection geometry stays entirely
// renderer-owned.
class RuleSectionLabelField extends Blockly.FieldLabel {
  constructor(text, colour, tooltip = '') {
    // Keep Blockly's default typography. Only these section labels receive a
    // text class because their coloured background needs dark text contrast.
    super(text, 'ha-rule-section-label-text');
    this.colour_ = colour;
    this.backgroundRect_ = null;
    const [title = '', ...body] = String(tooltip || '').split('\n\n');
    this.tooltipTitle_ = title;
    this.tooltipBody_ = body.join('\n\n');
    this.tooltipElement_ = null;
    this.tooltipTimer_ = null;
    this.hideTimer_ = null;
    this.pinned_ = false;
    this.onLabelPointerEnter_ = () => this.scheduleSectionTooltip_();
    this.onLabelPointerMove_ = () => this.positionSectionTooltip_();
    this.onLabelPointerLeave_ = () => this.scheduleSectionTooltipHide_();
    this.onLabelClick_ = (event) => this.togglePinnedSectionTooltip_(event);
    this.onDocumentPointerDown_ = (event) => this.dismissPinnedTooltipOnOutsideClick_(event);
    // Rule labels use a rich, independently styled HTML popover. Suppress the
    // generic block tooltip so the two tooltip systems never overlap.
    this.setTooltip('');
  }

  initView() {
    super.initView();
    const root = this.getSvgRoot();
    if (!root || this.backgroundRect_) return;

    this.backgroundRect_ = Blockly.utils.dom.createSvgElement('rect', {
      x: 0,
      y: 0,
      width: RULE_LABEL_WIDTH,
      height: RULE_LABEL_HEIGHT,
      rx: 4,
      ry: 4,
      fill: this.colour_,
      // The label's custom popover owns hover interaction, so the whole
      // coloured surface must receive pointer events.
      'pointer-events': 'all',
    }, root);
    root.insertBefore(this.backgroundRect_, this.getTextElement());
    root.style.cursor = 'help';
    // Listen on the field group, not only its background rectangle. The text
    // sits above that rectangle, so rect-only leave events would incorrectly
    // fire while the pointer was still over the same visible label.
    root.addEventListener('pointerenter', this.onLabelPointerEnter_);
    root.addEventListener('pointermove', this.onLabelPointerMove_);
    root.addEventListener('pointerleave', this.onLabelPointerLeave_);
    root.addEventListener('click', this.onLabelClick_);
    document.addEventListener('pointerdown', this.onDocumentPointerDown_, true);
  }

  updateSize_() {
    super.updateSize_(0);
    const textWidth = this.size_.width;
    this.size_.width = RULE_LABEL_WIDTH;
    this.size_.height = RULE_LABEL_HEIGHT;
    this.positionTextElement_(RULE_LABEL_PADDING_X, textWidth);

    if (this.backgroundRect_) {
      this.backgroundRect_.setAttribute('width', String(RULE_LABEL_WIDTH));
      this.backgroundRect_.setAttribute('height', String(RULE_LABEL_HEIGHT));
    }
  }

  dispose() {
    const root = this.getSvgRoot();
    if (root) {
      root.removeEventListener('pointerenter', this.onLabelPointerEnter_);
      root.removeEventListener('pointermove', this.onLabelPointerMove_);
      root.removeEventListener('pointerleave', this.onLabelPointerLeave_);
      root.removeEventListener('click', this.onLabelClick_);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', this.onDocumentPointerDown_, true);
    }
    this.hideSectionTooltip_();
    this.tooltipElement_?.remove();
    super.dispose();
  }

  scheduleSectionTooltip_() {
    if (!this.tooltipTitle_ || !this.backgroundRect_) return;
    this.clearHideTimer_();
    if (activeRuleSectionTooltipField && activeRuleSectionTooltipField !== this) {
      if (activeRuleSectionTooltipField.pinned_) return;
      // Keep the previous surface alive while moving between labels, then
      // replace its contents immediately instead of waiting through another
      // hover delay.
      activeRuleSectionTooltipField.hideSectionTooltip_({ keepElement: true });
      this.showSectionTooltip_();
      return;
    }
    if (this.tooltipElement_ && !this.tooltipElement_.hidden) {
      this.positionSectionTooltip_();
      return;
    }
    this.clearTooltipTimer_();
    this.tooltipTimer_ = window.setTimeout(() => this.showSectionTooltip_(), RULE_TOOLTIP_DELAY_MS);
  }

  showSectionTooltip_() {
    this.tooltipTimer_ = null;
    if (!this.backgroundRect_ || !this.tooltipTitle_) return;
    if (!this.tooltipElement_) {
      this.tooltipElement_ = document.createElement('div');
      this.tooltipElement_.className = 'ha-rule-section-tooltip';
      this.tooltipElement_.setAttribute('role', 'tooltip');
      document.body.appendChild(this.tooltipElement_);
    }
    this.tooltipElement_.replaceChildren();
    const title = document.createElement('div');
    title.className = 'ha-rule-section-tooltip-title';
    title.textContent = this.tooltipTitle_;
    const body = document.createElement('div');
    body.className = 'ha-rule-section-tooltip-body';
    body.textContent = this.tooltipBody_;
    this.tooltipElement_.append(title, body);
    this.tooltipElement_.style.setProperty('--ha-rule-tooltip-accent', this.colour_);
    this.tooltipElement_.hidden = false;
    activeRuleSectionTooltipField = this;
    this.positionSectionTooltip_();
  }

  positionSectionTooltip_() {
    if (!this.tooltipElement_ || this.tooltipElement_.hidden || !this.backgroundRect_) return;
    const rect = this.backgroundRect_.getBoundingClientRect();
    this.tooltipElement_.style.left = `${rect.left + rect.width / 2}px`;
    this.tooltipElement_.style.top = `${rect.top - 10}px`;
  }

  scheduleSectionTooltipHide_() {
    if (this.pinned_) return;
    this.clearHideTimer_();
    this.hideTimer_ = window.setTimeout(
      () => this.hideSectionTooltip_({ keepElement: true }),
      RULE_TOOLTIP_HIDE_DELAY_MS,
    );
  }

  togglePinnedSectionTooltip_(event) {
    event.preventDefault();
    event.stopPropagation();
    if (this.pinned_) {
      this.pinned_ = false;
      this.scheduleSectionTooltipHide_();
      return;
    }
    if (activeRuleSectionTooltipField && activeRuleSectionTooltipField !== this) {
      activeRuleSectionTooltipField.pinned_ = false;
      activeRuleSectionTooltipField.hideSectionTooltip_({ keepElement: true });
    }
    this.pinned_ = true;
    this.clearHideTimer_();
    this.clearTooltipTimer_();
    this.showSectionTooltip_();
  }

  dismissPinnedTooltipOnOutsideClick_(event) {
    if (!this.pinned_ || this.backgroundRect_?.contains(event.target)) return;
    this.pinned_ = false;
    this.hideSectionTooltip_({ keepElement: true });
  }

  clearTooltipTimer_() {
    if (this.tooltipTimer_ === null) return;
    window.clearTimeout(this.tooltipTimer_);
    this.tooltipTimer_ = null;
  }

  clearHideTimer_() {
    if (this.hideTimer_ === null) return;
    window.clearTimeout(this.hideTimer_);
    this.hideTimer_ = null;
  }

  hideSectionTooltip_({ keepElement = false } = {}) {
    this.clearTooltipTimer_();
    this.clearHideTimer_();
    if (this.tooltipElement_) this.tooltipElement_.hidden = true;
    if (activeRuleSectionTooltipField === this) activeRuleSectionTooltipField = null;
    if (!keepElement) this.tooltipElement_?.remove();
    if (!keepElement) this.tooltipElement_ = null;
  }

  static fromJson(options) {
    return new RuleSectionLabelField(
      options.text || '', options.colour || '#ffffff', options.tooltip || '',
    );
  }
}

try {
  Blockly.fieldRegistry.register('field_ha_rule_section_label', RuleSectionLabelField);
} catch (error) {
  // Webpack HMR may evaluate this module again after the field has already
  // been registered. Blockly otherwise throws for that harmless duplicate.
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
        { "type": "field_ha_rule_section_label", "text": "Trigger", "colour": "#7CB4B4", "tooltip": RULE_SECTION_TOOLTIPS.trigger },
        { "type": "input_statement", "name": "EVENT", "check": "HA_EVENT" }
      ],
      "message2": "%1 %2", "args2": [
        { "type": "field_ha_rule_section_label", "text": "Action", "colour": "#E3CC57", "tooltip": RULE_SECTION_TOOLTIPS.action },
        { "type": "input_statement", "name": "ACTION", "check": "HA_ACTION" }
      ],
      "colour": "3B4574","tooltip": "",
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
        { "type": "field_ha_rule_section_label", "text": "Trigger", "colour": "#7CB4B4", "tooltip": RULE_SECTION_TOOLTIPS.trigger },
        { "type": "input_statement", "name": "EVENT", "check": "HA_EVENT" }
      ],
     "message2": "%1 %2", "args2": [
        { "type": "field_ha_rule_section_label", "text": "Condition", "colour": "#AECA3E", "tooltip": RULE_SECTION_TOOLTIPS.condition },
        { "type": "input_statement", "name": "CONDITION", "check": "HA_CONDITION" }
      ],
     "message3": "%1 %2", "args3": [
        { "type": "field_ha_rule_section_label", "text": "Action", "colour": "#E3CC57", "tooltip": RULE_SECTION_TOOLTIPS.action },
        { "type": "input_statement", "name": "ACTION", "check": "HA_ACTION"}
      ],
      "colour": "3B4574",
      "tooltip": "",
      "helpUrl": "",
      "mutator": "ha_rule_optional_metadata"
    }
  ]);
