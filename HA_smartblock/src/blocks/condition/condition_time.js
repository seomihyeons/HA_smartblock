import * as Blockly from 'blockly';

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

Blockly.Blocks['condition_time'] = {
  init() {
    this.hasAfter_ = false;
    this.hasBefore_ = false;
    this.setPreviousStatement(true, 'HA_CONDITION');
    this.setNextStatement(true, 'HA_CONDITION');
    this.setColour('#AECA3E');
    this.setTooltip('time 조건: after/before를 선택해 시간 범위를 설정합니다.');
    this.setHelpUrl('');
    this.updateShape_();
  },

  saveExtraState() {
    return { hasAfter: !!this.hasAfter_, hasBefore: !!this.hasBefore_ };
  },

  loadExtraState(state) {
    this.hasAfter_ = !!state?.hasAfter;
    this.hasBefore_ = !!state?.hasBefore;
    this.updateShape_();
  },

  updateWarning_() {
    if (!this.hasAfter_ && !this.hasBefore_) {
      this.setWarningText('after 또는 before 중 하나는 선택해야 합니다.');
      return;
    }
    this.setWarningText(null);
  },

  updateShape_() {
    const afterH = this.getFieldValue('AFTER_H') ?? 0;
    const afterM = this.getFieldValue('AFTER_M') ?? 0;
    const afterS = this.getFieldValue('AFTER_S') ?? 0;
    const beforeH = this.getFieldValue('BEFORE_H') ?? 0;
    const beforeM = this.getFieldValue('BEFORE_M') ?? 0;
    const beforeS = this.getFieldValue('BEFORE_S') ?? 0;

    if (this.getInput('ROW')) this.removeInput('ROW');

    const afterToggle = new Blockly.FieldCheckbox(this.hasAfter_ ? 'TRUE' : 'FALSE');
    const beforeToggle = new Blockly.FieldCheckbox(this.hasBefore_ ? 'TRUE' : 'FALSE');

    afterToggle.setValidator((newVal) => {
      const next = newVal === 'TRUE';
      if (next === this.hasAfter_) return newVal;
      this.hasAfter_ = next;
      this.updateShape_();
      return newVal;
    });

    beforeToggle.setValidator((newVal) => {
      const next = newVal === 'TRUE';
      if (next === this.hasBefore_) return newVal;
      this.hasBefore_ = next;
      this.updateShape_();
      return newVal;
    });

    const row = this.appendDummyInput('ROW')
      .appendField('time')
      .appendField('after')
      .appendField(afterToggle, 'USE_AFTER');

    if (this.hasAfter_) {
      const [h, hName, c1, m, mName, c2, s, sName] = makeHmsField(afterH, afterM, afterS, 'AFTER');
      row.appendField(h, hName).appendField(c1).appendField(m, mName).appendField(c2).appendField(s, sName);
    }

    row.appendField('before').appendField(beforeToggle, 'USE_BEFORE');

    if (this.hasBefore_) {
      const [h, hName, c1, m, mName, c2, s, sName] = makeHmsField(beforeH, beforeM, beforeS, 'BEFORE');
      row.appendField(h, hName).appendField(c1).appendField(m, mName).appendField(c2).appendField(s, sName);
    }

    this.updateWarning_();
  },
};

export const conditionTimeBlocks = [];
