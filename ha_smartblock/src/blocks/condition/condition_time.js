import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities_index.js';

const toInt = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function makeHmsField(h, m, s, prefix) {
  return [
    new Blockly.FieldNumber(toInt(h), 0, 23, 1), `${prefix}_H`,
    ':',
    new Blockly.FieldNumber(toInt(m), 0, 59, 1), `${prefix}_M`,
    ':',
    new Blockly.FieldNumber(toInt(s), 0, 59, 1), `${prefix}_S`,
  ];
}

function getTimeEntityOptions() {
  const list = (dummyEntities || []).filter((e) => {
    const id = String(e?.entity_id || '');
    if (id.startsWith('input_datetime.')) return true;
    if (id.startsWith('time.')) return true;
    if (id.startsWith('sensor.') && String(e?.attributes?.device_class || '') === 'timestamp') return true;
    return false;
  });
  if (!list.length) return [['(No time entity)', '']];
  return list.map((e) => [e.attributes?.friendly_name || e.entity_id, e.entity_id]);
}

Blockly.Blocks.condition_time = {
  init() {
    this.hasAfter_ = false;
    this.hasBefore_ = false;
    this.afterMode_ = 'TIME';
    this.beforeMode_ = 'TIME';
    this.setPreviousStatement(true, 'HA_CONDITION');
    this.setNextStatement(true, 'HA_CONDITION');
    this.setColour('#AECA3E');
    this.setTooltip('Time condition: configure after and/or before.');
    this.setHelpUrl('');
    this.setOnChange(() => this.updateWarning_());
    this.updateShape_();
  },

  saveExtraState() {
    return {
      hasAfter: !!this.hasAfter_,
      hasBefore: !!this.hasBefore_,
      afterMode: this.afterMode_ || 'TIME',
      beforeMode: this.beforeMode_ || 'TIME',
    };
  },

  loadExtraState(state) {
    this.hasAfter_ = !!state?.hasAfter;
    this.hasBefore_ = !!state?.hasBefore;
    this.afterMode_ = state?.afterMode || 'TIME';
    this.beforeMode_ = state?.beforeMode || 'TIME';
    this.updateShape_();
  },

  updateWarning_() {
    if (!this.hasAfter_ && !this.hasBefore_) {
      this.setWarningText('You must select at least one of after or before.');
      return;
    }
    this.setWarningText(null);
  },

  updateShape_() {
    const get = (name, d = '') => this.getFieldValue(name) ?? d;
    const afterH = get('AFTER_H', 0);
    const afterM = get('AFTER_M', 0);
    const afterS = get('AFTER_S', 0);
    const beforeH = get('BEFORE_H', 0);
    const beforeM = get('BEFORE_M', 0);
    const beforeS = get('BEFORE_S', 0);
    const afterEntity = get('AFTER_ENTITY', '');
    const beforeEntity = get('BEFORE_ENTITY', '');
    // Use cached mode first. During dropdown validator callbacks,
    // field value may still be old until validator returns.
    const afterMode = this.afterMode_ || get('AFTER_MODE', 'TIME');
    const beforeMode = this.beforeMode_ || get('BEFORE_MODE', 'TIME');

    if (this.getInput('ROW')) this.removeInput('ROW');

    const afterToggle = new Blockly.FieldCheckbox(this.hasAfter_ ? 'TRUE' : 'FALSE');
    const beforeToggle = new Blockly.FieldCheckbox(this.hasBefore_ ? 'TRUE' : 'FALSE');

    afterToggle.setValidator((newVal) => {
      this.hasAfter_ = newVal === 'TRUE';
      this.updateShape_();
      return newVal;
    });

    beforeToggle.setValidator((newVal) => {
      this.hasBefore_ = newVal === 'TRUE';
      this.updateShape_();
      return newVal;
    });

    const row = this.appendDummyInput('ROW')
      .appendField('time')
      .appendField('after')
      .appendField(afterToggle, 'USE_AFTER');

    if (this.hasAfter_) {
      row.appendField(new Blockly.FieldDropdown([['time', 'TIME'], ['entity', 'ENTITY']]), 'AFTER_MODE');
      this.setFieldValue(afterMode, 'AFTER_MODE');
      this.afterMode_ = afterMode;
      this.getField('AFTER_MODE')?.setValidator((newVal) => {
        this.afterMode_ = newVal || 'TIME';
        this.updateShape_();
        return newVal;
      });
      if (afterMode === 'ENTITY') {
        row.appendField(new Blockly.FieldDropdown(() => getTimeEntityOptions()), 'AFTER_ENTITY');
        if (afterEntity) this.setFieldValue(afterEntity, 'AFTER_ENTITY');
      } else {
        const [h, hName, c1, m, mName, c2, s, sName] = makeHmsField(afterH, afterM, afterS, 'AFTER');
        row.appendField(h, hName).appendField(c1).appendField(m, mName).appendField(c2).appendField(s, sName);
      }
    }

    row.appendField('before').appendField(beforeToggle, 'USE_BEFORE');

    if (this.hasBefore_) {
      row.appendField(new Blockly.FieldDropdown([['time', 'TIME'], ['entity', 'ENTITY']]), 'BEFORE_MODE');
      this.setFieldValue(beforeMode, 'BEFORE_MODE');
      this.beforeMode_ = beforeMode;
      this.getField('BEFORE_MODE')?.setValidator((newVal) => {
        this.beforeMode_ = newVal || 'TIME';
        this.updateShape_();
        return newVal;
      });
      if (beforeMode === 'ENTITY') {
        row.appendField(new Blockly.FieldDropdown(() => getTimeEntityOptions()), 'BEFORE_ENTITY');
        if (beforeEntity) this.setFieldValue(beforeEntity, 'BEFORE_ENTITY');
      } else {
        const [h, hName, c1, m, mName, c2, s, sName] = makeHmsField(beforeH, beforeM, beforeS, 'BEFORE');
        row.appendField(h, hName).appendField(c1).appendField(m, mName).appendField(c2).appendField(s, sName);
      }
    }

    this.updateWarning_();
  },
};

Blockly.Blocks.condition_time_weekly = {
  init() {
    this.appendDummyInput('ROW')
      .appendField('time weekday')
      .appendField('mon').appendField(new Blockly.FieldCheckbox('FALSE'), 'MON')
      .appendField('tue').appendField(new Blockly.FieldCheckbox('FALSE'), 'TUE')
      .appendField('wed').appendField(new Blockly.FieldCheckbox('FALSE'), 'WED')
      .appendField('thu').appendField(new Blockly.FieldCheckbox('FALSE'), 'THU')
      .appendField('fri').appendField(new Blockly.FieldCheckbox('FALSE'), 'FRI')
      .appendField('sat').appendField(new Blockly.FieldCheckbox('FALSE'), 'SAT')
      .appendField('sun').appendField(new Blockly.FieldCheckbox('FALSE'), 'SUN');
    this.setPreviousStatement(true, 'HA_CONDITION');
    this.setNextStatement(true, 'HA_CONDITION');
    this.setColour('#AECA3E');
    this.setTooltip('Time condition: select weekdays.');
    this.setHelpUrl('');
  },
};

// Legacy compatibility blocks (hidden from toolbox)
function registerLegacyTimePart(type, label, prefix) {
  Blockly.Blocks[type] = {
    init() {
      this.mode_ = 'TIME';
      this.appendDummyInput('ROW')
        .appendField('time')
        .appendField(label)
        .appendField(new Blockly.FieldDropdown([['time', 'TIME'], ['entity', 'ENTITY']]), 'MODE');

      this.getField('MODE')?.setValidator((newVal) => {
        this.mode_ = newVal || 'TIME';
        this.updateShape_();
        return newVal;
      });

      this.setPreviousStatement(true, 'HA_CONDITION');
      this.setNextStatement(true, 'HA_CONDITION');
      this.setColour('#AECA3E');
      this.setTooltip(`legacy ${label}`);
      this.setHelpUrl('');
      this.updateShape_();
    },

    updateShape_() {
      const row = this.getInput('ROW');
      if (!row) return;

      const h = this.getFieldValue(`${prefix}_H`) ?? 0;
      const m = this.getFieldValue(`${prefix}_M`) ?? 0;
      const s = this.getFieldValue(`${prefix}_S`) ?? 0;
      const eid = this.getFieldValue('ENTITY_ID') ?? '';

      if (row.fieldRow?.some((f) => f.name === `${prefix}_H`)) row.removeField(`${prefix}_H`, true);
      if (row.fieldRow?.some((f) => f.name === `${prefix}_M`)) row.removeField(`${prefix}_M`, true);
      if (row.fieldRow?.some((f) => f.name === `${prefix}_S`)) row.removeField(`${prefix}_S`, true);
      if (row.fieldRow?.some((f) => f.name === `${prefix}_C1`)) row.removeField(`${prefix}_C1`, true);
      if (row.fieldRow?.some((f) => f.name === `${prefix}_C2`)) row.removeField(`${prefix}_C2`, true);
      if (row.fieldRow?.some((f) => f.name === 'ENTITY_ID')) row.removeField('ENTITY_ID', true);

      const mode = this.getFieldValue('MODE') || this.mode_ || 'TIME';
      if (mode === 'ENTITY') {
        row.appendField(new Blockly.FieldDropdown(() => getTimeEntityOptions()), 'ENTITY_ID');
        if (eid) this.setFieldValue(eid, 'ENTITY_ID');
      } else {
        row.appendField(new Blockly.FieldNumber(toInt(h), 0, 23, 1), `${prefix}_H`)
          .appendField(':', `${prefix}_C1`)
          .appendField(new Blockly.FieldNumber(toInt(m), 0, 59, 1), `${prefix}_M`)
          .appendField(':', `${prefix}_C2`)
          .appendField(new Blockly.FieldNumber(toInt(s), 0, 59, 1), `${prefix}_S`);
      }
    },
  };
}

registerLegacyTimePart('condition_time_after', 'after', 'AFTER');
registerLegacyTimePart('condition_time_before', 'before', 'BEFORE');

export const conditionTimeBlocks = [];
