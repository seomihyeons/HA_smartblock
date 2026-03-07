// src/blocks/action/action_data.js
import * as Blockly from 'blockly';
import { getClimatePresetOptions } from '../../data/options.js';

const COLOR_MODE_OPTIONS = [
  ['name', 'name'],
  ['rgb', 'rgb'],
];

const EFFECT_OPTIONS = [
  ['Daylight', 'Daylight'],
  ['Rainbow', 'Rainbow'],
  ['Colorloop', 'Colorloop'],
  ['None', 'None'],
];

const MEDIA_CONTENT_TYPE_OPTIONS = [
  ['music', 'music'],
  ['video', 'video'],
  ['tvshow', 'tvshow'],
  ['episode', 'episode'],
  ['channel', 'channel'],
  ['playlist', 'playlist'],
];

const NUMERIC_KV_KEYS = new Set([
  'position',
  'brightness_pct',
  'transition',
  'temperature',
  'target_temp_high',
  'target_temp_low',
  'humidity',
  'volume_level',
  'critical',
  'volume',
]);

const kvTypeByKey = (rawKey) => {
  const k = String(rawKey || '').trim().toLowerCase();
  return NUMERIC_KV_KEYS.has(k) ? 'number' : 'text';
};

export const actionDataBlocks = Blockly.common.createBlockDefinitionsFromJsonArray([
  // light.turn_on에서 자주 쓰는 옵션
  {
    type: 'action_data_brightness_pct',
    message0: 'brightness_pct %1',
    args0: [
      { type: 'field_number', name: 'VALUE', value: 100, min: 0, max: 100, precision: 1 },
    ],
    previousStatement: 'HA_ACTION_DATA',
    nextStatement: 'HA_ACTION_DATA',
    colour: '#E3CC57',
    tooltip: '0~100 밝기 퍼센트',
    helpUrl: '',
  },

  {
    type: 'action_data_transition',
    message0: 'transition %1 sec',
    args0: [
      { type: 'field_number', name: 'SECONDS', value: 0, min: 0, precision: 1 },
    ],
    previousStatement: 'HA_ACTION_DATA',
    nextStatement: 'HA_ACTION_DATA',
    colour: '#E3CC57',
    tooltip: '전환 시간(초)',
    helpUrl: '',
  },

  {
    type: 'action_data_effect',
    message0: 'effect %1',
    args0: [
      { type: 'field_dropdown', name: 'EFFECT', options: EFFECT_OPTIONS },
    ],
    previousStatement: 'HA_ACTION_DATA',
    nextStatement: 'HA_ACTION_DATA',
    colour: '#E3CC57',
    tooltip: '조명 effect를 선택하거나 custom 값을 입력합니다.',
    helpUrl: '',
  },

  {
    type: 'action_data_announce',
    message0: 'announce %1',
    args0: [
      { type: 'field_dropdown', name: 'VALUE', options: [['true', 'true'], ['false', 'false']] },
    ],
    previousStatement: 'HA_ACTION_DATA',
    nextStatement: 'HA_ACTION_DATA',
    colour: '#E3CC57',
    tooltip: 'media_player.play_media announce 옵션',
    helpUrl: '',
  },

  {
    type: 'action_data_media_content_type',
    message0: 'media_content_type %1',
    args0: [
      { type: 'field_dropdown', name: 'VALUE', options: MEDIA_CONTENT_TYPE_OPTIONS },
    ],
    previousStatement: 'HA_ACTION_DATA',
    nextStatement: 'HA_ACTION_DATA',
    colour: '#E3CC57',
    tooltip: 'media_player.play_media media_content_type 옵션',
    helpUrl: '',
  },

  {
    type: 'action_data_climate_preset_mode',
    message0: 'preset_mode %1',
    args0: [
      { type: 'field_dropdown', name: 'VALUE', options: getClimatePresetOptions },
    ],
    previousStatement: 'HA_ACTION_DATA',
    nextStatement: 'HA_ACTION_DATA',
    colour: '#E3CC57',
    tooltip: 'climate.set_preset_mode preset_mode 값',
    helpUrl: '',
  },

  // 범용: key/value 하나 찍는 블록 (나중에 확장할 때 유용)
  {
    type: 'action_data_kv_text',
    message0: '%1 : %2 (%3)',
    args0: [
      { type: 'field_input', name: 'KEY', text: 'key', spellcheck: true },
      { type: 'field_input', name: 'VALUE', text: 'value', spellcheck: true },
      { type: 'field_input', name: 'VALUE_TYPE', text: 'text', spellcheck: false },
    ],
    previousStatement: 'HA_ACTION_DATA',
    nextStatement: 'HA_ACTION_DATA',
    colour: '#E3CC57',
    tooltip: '범용 key/value 텍스트 블록',
    helpUrl: '',
    extensions: ['ha_action_data_kv_autotype'],
  },
]);

Blockly.Extensions.register('ha_action_data_kv_autotype', function () {
  const keyField = this.getField('KEY');
  const typeField = this.getField('VALUE_TYPE');
  if (!keyField || !typeField) return;

  const syncType = (keyVal) => {
    const inferred = kvTypeByKey(keyVal);
    if (typeField.getValue() !== inferred) {
      typeField.setValue(inferred);
    }
  };

  syncType(keyField.getValue());

  keyField.setValidator((newVal) => {
    syncType(newVal);
    return newVal;
  });
});

Blockly.Blocks['action_data_color'] = {
  init() {
    this.mode_ = 'name';
    this.setPreviousStatement(true, 'HA_ACTION_DATA');
    this.setNextStatement(true, 'HA_ACTION_DATA');
    this.setColour('#E3CC57');
    this.setTooltip('name은 1칸 입력, rgb는 3칸(R/G/B) 입력');
    this.setHelpUrl('');

    this.updateValueInput_();
  },

  updateValueInput_() {
    const prevName = this.getFieldValue('NAME') || 'red';
    const prevR = Number(this.getFieldValue('R') || 255);
    const prevG = Number(this.getFieldValue('G') || 0);
    const prevB = Number(this.getFieldValue('B') || 0);

    if (this.getInput('ROW')) this.removeInput('ROW');
    const modeField = new Blockly.FieldDropdown(COLOR_MODE_OPTIONS);

    const input = this.appendDummyInput('ROW')
      .appendField('color')
      .appendField(modeField, 'MODE');

    if (this.mode_ === 'rgb') {
      modeField.setValue('rgb');
    } else {
      modeField.setValue('name');
    }

    if (this.mode_ === 'rgb') {
      input
        .appendField(new Blockly.FieldNumber(prevR, 0, 255, 1), 'R')
        .appendField(new Blockly.FieldNumber(prevG, 0, 255, 1), 'G')
        .appendField(new Blockly.FieldNumber(prevB, 0, 255, 1), 'B');
    } else {
      input
        .appendField(new Blockly.FieldTextInput(prevName), 'NAME');
    }

    modeField.setValidator((newMode) => {
      const nextMode = newMode || 'name';
      if (nextMode === this.mode_) return nextMode;
      this.mode_ = nextMode;
      this.updateValueInput_();
      return nextMode;
    });
  },
};
