import * as Blockly from 'blockly';

const CONCURRENT_MODES = new Set(['queued', 'parallel']);

const modeOptions = [
  ['single', 'single'],
  ['restart', 'restart'],
  ['queued', 'queued'],
  ['parallel', 'parallel'],
];

const maxExceededOptions = [
  ['Home Assistant default', '__default__'],
  ['silent', 'silent'],
  ['debug', 'debug'],
  ['info', 'info'],
  ['warning', 'warning'],
  ['error', 'error'],
  ['critical', 'critical'],
];

// This block belongs exclusively in a Rule block's optional Metadata input.
// It is intentionally absent from the toolbox so the normal EA/ECA workflow
// remains compact.
Blockly.Blocks.ha_rule_execution = {
  init() {
    this.maxEnabled_ = false;
    this.maxValue_ = 10;

    this.appendDummyInput('EXECUTION')
      .appendField('mode')
      .appendField(new Blockly.FieldDropdown(modeOptions), 'MODE');

    this.setPreviousStatement(true, 'HA_METADATA');
    this.setNextStatement(true, 'HA_METADATA');
    this.setColour('3B4574');
    this.setTooltip('Configures how Home Assistant handles overlapping automation runs.');
    this.setHelpUrl('');

    this.getField('MODE')?.setValidator((value) => {
      setTimeout(() => this.updateShape_(), 0);
      return value;
    });

    this.updateShape_();
  },

  updateShape_() {
    const mode = this.getFieldValue('MODE') || 'single';
    const supportsMax = CONCURRENT_MODES.has(mode);
    const executionInput = this.getInput('EXECUTION');
    const hasMaxToggle = !!this.getField('USE_MAX');

    if (!supportsMax) {
      if (hasMaxToggle) {
        const useMax = this.getFieldValue('USE_MAX') === 'TRUE';
        const max = Number(this.getFieldValue('MAX') || this.maxValue_ || 10);
        this.maxEnabled_ = useMax;
        this.maxValue_ = Number.isFinite(max) && max >= 1 ? max : 10;
        executionInput.removeField('MAX', true);
        executionInput.removeField('USE_MAX', true);
        executionInput.removeField('MAX_LABEL', true);
      }
    } else if (!hasMaxToggle) {
      executionInput
        .appendField('max', 'MAX_LABEL')
        .appendField(new Blockly.FieldCheckbox(this.maxEnabled_ ? 'TRUE' : 'FALSE'), 'USE_MAX');

      if (this.maxEnabled_) {
        executionInput.appendField(new Blockly.FieldNumber(this.maxValue_, 1, Infinity, 1), 'MAX');
      }

      this.getField('USE_MAX')?.setValidator((value) => {
        this.maxEnabled_ = value === 'TRUE';
        setTimeout(() => this.updateShape_(), 0);
        return value;
      });
    } else {
      const enabled = this.getFieldValue('USE_MAX') === 'TRUE';
      this.maxEnabled_ = enabled;
      const hasNumber = !!this.getField('MAX');

      if (enabled && !hasNumber) {
        executionInput.appendField(new Blockly.FieldNumber(this.maxValue_, 1, Infinity, 1), 'MAX');
      } else if (!enabled && hasNumber) {
        const value = Number(this.getFieldValue('MAX') || this.maxValue_ || 10);
        this.maxValue_ = Number.isFinite(value) && value >= 1 ? value : 10;
        executionInput.removeField('MAX', true);
      }
    }

    if (this.rendered) this.render();
  },
};

Blockly.Blocks.ha_rule_max_exceeded = {
  init() {
    this.appendDummyInput('ROW')
      .appendField('max exceeded')
      .appendField(new Blockly.FieldDropdown(maxExceededOptions), 'MAX_EXCEEDED');
    this.setPreviousStatement(true, 'HA_METADATA');
    this.setNextStatement(true, 'HA_METADATA');
    this.setColour('3B4574');
    this.setTooltip('Sets the log behavior when the automation run limit is exceeded.');
    this.setHelpUrl('');
  },
};

// The custom block registers itself above. Keep this export so index.js can
// retain the same registration pattern as the other block modules.
export const ruleMetadataBlocks = [];
