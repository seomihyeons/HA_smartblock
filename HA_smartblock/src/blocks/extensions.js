// src/blocks/extensions.js
import * as Blockly from 'blockly';

const HaActionOptionalDataMutator = {
  hasData_: false,

  saveExtraState() {
    return { hasData: this.hasData_ };
  },

  loadExtraState(state) {
    this.hasData_ = !!state?.hasData;
    this.updateShape_();
  },

  updateShape_() {
    const inputName = 'DATA';
    const exists = !!this.getInput(inputName);

    if (this.hasData_ && !exists) {
      this.appendStatementInput(inputName)
        .setCheck('HA_ACTION_DATA')
        .appendField('data');
    } else if (!this.hasData_ && exists) {
      this.removeInput(inputName);
    }
  },

  customContextMenu(options) {
    options.push({
      text: this.hasData_ ? 'Hide data' : 'Show data',
      enabled: true,
      callback: () => {
        this.hasData_ = !this.hasData_;
        this.updateShape_();

        // workspace에 붙어 있고 SVG가 준비된 경우에만 렌더
        if (this.rendered) this.render();
      },
    });
  },
};

Blockly.Extensions.registerMutator('ha_action_optional_data', HaActionOptionalDataMutator);
