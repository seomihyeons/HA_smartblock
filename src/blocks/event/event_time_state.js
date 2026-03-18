// src/blocks/event_time_state.js
import * as Blockly from 'blockly';

const baseTimeBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
    { "type": "ha_event_time_state", "message0": "at %1 : %2 %3 %4",
      "args0": [
        { "type": "field_number", "name": "HOUR", "value": 8, "min": 1, "max": 12, "precision": 1 },
        { "type": "field_number", "name": "MIN", "value": 0, "min": 0, "max": 59, "precision": 1 },
        { "type": "field_dropdown", "name": "PERIOD", "options": [ ["AM", "AM"], ["PM", "PM"] ] },
        { "type": "input_value", "name": "EXTRA" } ],
      "previousStatement": "HA_EVENT",
      "nextStatement": "HA_EVENT",
      "inputsInline": false,
      "colour": 180,
      "tooltip": "지정한 시각에 트리거됩니다. (오른쪽 슬롯에 주/월 제약 블럭을 연결해서 확장 가능)",
      "helpUrl": ""
    }
  ]);

function isValidTimePatternField(raw, min, max) {
  const text = String(raw || '').trim();
  if (!text) return true;

  const list = text.split(',').map((x) => x.trim()).filter(Boolean);
  if (!list.length) return false;

  const numOk = (v) => {
    if (!/^\d+$/.test(v)) return false;
    if (v.length > 1 && v.startsWith('0')) return false;
    const n = Number(v);
    return Number.isInteger(n) && n >= min && n <= max;
  };

  const stepOk = (v) => /^\d+$/.test(v) && Number(v) > 0;
  const rangeOk = (a, b) => numOk(a) && numOk(b) && Number(a) <= Number(b);

  for (const token of list) {
    if (token === '*') continue;

    if (/^\*\/\d+$/.test(token)) {
      if (!stepOk(token.split('/')[1])) return false;
      continue;
    }

    if (/^\/\d+$/.test(token)) {
      if (!stepOk(token.slice(1))) return false;
      continue;
    }

    if (/^\d+$/.test(token)) {
      if (!numOk(token)) return false;
      continue;
    }

    const rangeStep = token.match(/^(\d+)-(\d+)\/(\d+)$/);
    if (rangeStep) {
      const [, a, b, s] = rangeStep;
      if (!rangeOk(a, b) || !stepOk(s)) return false;
      continue;
    }

    const range = token.match(/^(\d+)-(\d+)$/);
    if (range) {
      const [, a, b] = range;
      if (!rangeOk(a, b)) return false;
      continue;
    }

    return false;
  }

  return true;
}

function validateTimePatternBlock(block) {
  const h = String(block.getFieldValue('HOURS') || '').trim();
  const m = String(block.getFieldValue('MINUTES') || '').trim();
  const s = String(block.getFieldValue('SECONDS') || '').trim();
  const hasAny = !!(h || m || s);

  const validH = isValidTimePatternField(h, 0, 23);
  const validM = isValidTimePatternField(m, 0, 59);
  const validS = isValidTimePatternField(s, 0, 59);

  if (!hasAny) {
    block.setWarningText('hours/minutes/seconds 중 최소 1개는 입력해야 합니다.');
    return;
  }
  if (!validH || !validM || !validS) {
    block.setWarningText('time_pattern 형식이 올바르지 않습니다. (예: *, /5, 0, 1,15,30, 1-5)');
    return;
  }
  block.setWarningText(null);
}

const timePatternBlock = {
  init() {
    this.appendDummyInput('ROW')
      .appendField('time pattern')
      .appendField(new Blockly.FieldTextInput(''), 'HOURS')
      .appendField(':')
      .appendField(new Blockly.FieldTextInput(''), 'MINUTES')
      .appendField(':')
      .appendField(new Blockly.FieldTextInput(''), 'SECONDS')
      .appendField('id')
      .appendField(new Blockly.FieldCheckbox('FALSE'), 'USE_ID')
      .appendField(new Blockly.FieldTextInput(''), 'ID');

    this.setPreviousStatement(true, 'HA_EVENT');
    this.setNextStatement(true, 'HA_EVENT');
    this.setInputsInline(true);
    this.setColour(180);
    this.setTooltip('time_pattern trigger (hours/minutes/seconds는 패턴 입력 가능)');
    this.setHelpUrl('');

    const update = () => {
      this.updateShape_();
      validateTimePatternBlock(this);
    };

    this.getField('USE_ID')?.setValidator((newVal) => {
      setTimeout(update, 0);
      return newVal;
    });

    ['HOURS', 'MINUTES', 'SECONDS'].forEach((name) => {
      this.getField(name)?.setValidator((newVal) => {
        setTimeout(() => validateTimePatternBlock(this), 0);
        return newVal;
      });
    });

    this.updateShape_();
    validateTimePatternBlock(this);
  },

  updateShape_() {
    const useId = this.getFieldValue('USE_ID') === 'TRUE';
    this.getField('ID')?.setVisible(useId);
    if (!useId) this.setFieldValue('', 'ID');
    if (this.rendered) this.render();
  },
};

export const eventTimeStateBlocks = {
  ...baseTimeBlocks,
  ha_event_time_pattern: timePatternBlock,
};
