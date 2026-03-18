// src/blocks/extensions.js
import * as Blockly from 'blockly';

const HaActionOptionalDataMutator = {
  hasData_: false,
  isSyncingDataField_: false,

  saveExtraState() {
    return { hasData: this.hasData_ };
  },

  loadExtraState(state) {
    this.hasData_ = !!state?.hasData;
    this.updateShape_();
  },

  updateShape_() {
    const toggleName = 'DATA_TOGGLE';
    const inputName = 'DATA';
    const isMqttPublish = this.type === 'action_mqtt_publish';
    const hostInput = (this.type === 'action_group_entities' || isMqttPublish)
      ? (this.inputList?.[0] || null)
      : null;
    const hasToggle = !!this.getInput(toggleName);
    const exists = !!this.getInput(inputName);

    if (hostInput) {
      if (hasToggle) this.removeInput(toggleName, true);
      if (!this.getField('USE_DATA')) {
        hostInput
          .appendField('data')
          .appendField(new Blockly.FieldCheckbox(this.hasData_ ? 'TRUE' : 'FALSE'), 'USE_DATA');

        this.getField('USE_DATA')?.setValidator((newVal) => {
          if (this.isSyncingDataField_) return newVal;
          this.hasData_ = newVal === 'TRUE';
          this.updateShape_();
          return newVal;
        });
      }
    } else if (!hasToggle) {
      this.appendDummyInput(toggleName)
        .appendField('data')
        .appendField(new Blockly.FieldCheckbox(this.hasData_ ? 'TRUE' : 'FALSE'), 'USE_DATA');

      this.getField('USE_DATA')?.setValidator((newVal) => {
        if (this.isSyncingDataField_) return newVal;
        this.hasData_ = newVal === 'TRUE';
        this.updateShape_();
        return newVal;
      });
    }

    if (this.hasData_ && !exists) {
      const dataCheck = isMqttPublish ? 'HA_ACTION_MQTT_DATA' : 'HA_ACTION_DATA';
      this.appendStatementInput(inputName)
        .setCheck(dataCheck)
        .appendField('data');
    } else if (!this.hasData_ && exists) {
      this.removeInput(inputName);
    }

    const expected = this.hasData_ ? 'TRUE' : 'FALSE';
    if (this.getField('USE_DATA') && this.getFieldValue('USE_DATA') !== expected) {
      this.isSyncingDataField_ = true;
      this.setFieldValue(expected, 'USE_DATA');
      this.isSyncingDataField_ = false;
    }

    if (this.rendered) this.render();
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

Blockly.Extensions.registerMutator(
  'ha_action_optional_data',
  HaActionOptionalDataMutator,
  function () {
    if (typeof this.updateShape_ === 'function') this.updateShape_();
  }
);

const HaConditionOptionalDataMutator = {
  hasData_: false,
  isSyncingDataField_: false,

  saveExtraState() {
    return { hasData: this.hasData_ };
  },

  loadExtraState(state) {
    this.hasData_ = !!state?.hasData;
    this.updateShape_();
  },

  updateShape_() {
    const toggleName = 'DATA_TOGGLE';
    const inputName = 'DATA';
    const hostInput = this.getInput('MOD') ? (this.inputList?.[0] || null) : null;
    const hasToggle = !!this.getInput(toggleName);
    const exists = !!this.getInput(inputName);

    if (hostInput) {
      if (hasToggle) this.removeInput(toggleName, true);
      if (!this.getField('USE_DATA')) {
        hostInput
          .appendField('data')
          .appendField(new Blockly.FieldCheckbox(this.hasData_ ? 'TRUE' : 'FALSE'), 'USE_DATA');

        this.getField('USE_DATA')?.setValidator((newVal) => {
          if (this.isSyncingDataField_) return newVal;
          this.hasData_ = newVal === 'TRUE';
          this.updateShape_();
          return newVal;
        });
      }
    } else if (!hasToggle) {
      this.appendDummyInput(toggleName)
        .appendField('data')
        .appendField(new Blockly.FieldCheckbox(this.hasData_ ? 'TRUE' : 'FALSE'), 'USE_DATA');

      this.getField('USE_DATA')?.setValidator((newVal) => {
        if (this.isSyncingDataField_) return newVal;
        this.hasData_ = newVal === 'TRUE';
        this.updateShape_();
        return newVal;
      });
    }

    if (this.hasData_ && !exists) {
      this.appendStatementInput(inputName)
        .setCheck('HA_CONDITION_DATA')
        .appendField('data');
    } else if (!this.hasData_ && exists) {
      this.removeInput(inputName);
    }

    const expected = this.hasData_ ? 'TRUE' : 'FALSE';
    if (this.getField('USE_DATA') && this.getFieldValue('USE_DATA') !== expected) {
      this.isSyncingDataField_ = true;
      this.setFieldValue(expected, 'USE_DATA');
      this.isSyncingDataField_ = false;
    }

    if (this.rendered) this.render();
  },

  customContextMenu(options) {
    options.push({
      text: this.hasData_ ? 'Hide data' : 'Show data',
      enabled: true,
      callback: () => {
        this.hasData_ = !this.hasData_;
        this.updateShape_();
        if (this.rendered) this.render();
      },
    });
  },
};

Blockly.Extensions.registerMutator(
  'ha_condition_optional_data',
  HaConditionOptionalDataMutator,
  function () {
    if (typeof this.updateShape_ === 'function') this.updateShape_();
  }
);

const HaNotifyTagOptionalDetailsMutator = {
  hasDetails_: false,
  isSyncingDetailsField_: false,
  detailsValidatorBound_: false,

  saveExtraState() {
    return { hasDetails: this.hasDetails_ };
  },

  loadExtraState(state) {
    this.hasDetails_ = !!state?.hasDetails;
    this.updateShape_();
  },

  updateShape_() {
    const inputName = 'TAG_BLOCKS';
    const exists = !!this.getInput(inputName);
    const detailsField = this.getField('USE_DETAILS');

    if (detailsField && !this.detailsValidatorBound_) {
      detailsField.setValidator((newVal) => {
        if (this.isSyncingDetailsField_) return newVal;
        this.hasDetails_ = newVal === 'TRUE';
        this.updateShape_();
        return newVal;
      });
      this.detailsValidatorBound_ = true;
    }

    if (this.hasDetails_ && !exists) {
      this.appendStatementInput(inputName)
        .setCheck('HA_NOTIFY_TAG')
        .appendField('details');
    } else if (!this.hasDetails_ && exists) {
      this.removeInput(inputName, true);
    }

    const expected = this.hasDetails_ ? 'TRUE' : 'FALSE';
    if (detailsField && this.getFieldValue('USE_DETAILS') !== expected) {
      this.isSyncingDetailsField_ = true;
      this.setFieldValue(expected, 'USE_DETAILS');
      this.isSyncingDetailsField_ = false;
    }

    if (this.rendered) this.render();
  },

  customContextMenu(options) {
    options.push({
      text: this.hasDetails_ ? 'Hide details' : 'Show details',
      enabled: true,
      callback: () => {
        this.hasDetails_ = !this.hasDetails_;
        this.updateShape_();
        if (this.rendered) this.render();
      },
    });
  },
};

Blockly.Extensions.registerMutator(
  'ha_notify_tag_optional_details',
  HaNotifyTagOptionalDetailsMutator,
  function () {
    if (typeof this.updateShape_ === 'function') this.updateShape_();
  }
);
