import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities_index.js';
import { STATE_DOMAINS, getStates } from '../../data/options.js';

function getEntitiesByDomain(domain) {
  const filtered = dummyEntities.filter(e => e.entity_id.startsWith(`${domain}.`));
  if (!filtered.length) return [['(No entities)', '']];
  return filtered.map(e => [e.attributes?.friendly_name || e.entity_id, e.entity_id]);
}

const coverStateKindOptions = [
  ['open', 'open'],
  ['closed', 'closed'],
  ['opening', 'opening'],
  ['closing', 'closing'],
  ['unavailable', 'unavailable'],
  ['current_position', 'current_position'],
  ['current_tilt_position', 'current_tilt_position'],
  ['is_opening', 'is_opening'],
  ['is_closing', 'is_closing'],
  ['is_closed', 'is_closed'],
];

const coverBooleanOptions = [
  ['true', 'true'],
  ['false', 'false'],
];

Blockly.Blocks.condition_state_cover = {
  init: function () {
    this.appendDummyInput('HEAD')
      .appendField('cover')
      .appendField(new Blockly.FieldDropdown(() => getEntitiesByDomain('cover')), 'ENTITY_ID')
      .appendField('is')
      .appendField(new Blockly.FieldDropdown(coverStateKindOptions), 'STATE_KIND');

    this.setPreviousStatement(true, 'HA_CONDITION');
    this.setNextStatement(true, 'HA_CONDITION');
    this.setColour('#AECA3E');
    this.setTooltip('cover 엔티티의 상태/속성을 검사합니다.');
    this.setHelpUrl('');

    this.getField('STATE_KIND')?.setValidator((newValue) => {
      this.updateShape_(newValue);
      return newValue;
    });

    this.updateShape_(this.getFieldValue('STATE_KIND') || 'open');
  },

  updateShape_: function (stateKind) {
    const head = this.getInput('HEAD');
    if (head) {
      if (head.fieldRow?.some((f) => f.name === 'ATTR_NUMBER')) head.removeField('ATTR_NUMBER', true);
      if (head.fieldRow?.some((f) => f.name === 'ATTR_BOOL')) head.removeField('ATTR_BOOL', true);
    }

    if (stateKind === 'current_position' || stateKind === 'current_tilt_position') {
      head?.appendField(new Blockly.FieldNumber(0, 0, 100, 1), 'ATTR_NUMBER');
    } else if (stateKind === 'is_opening' || stateKind === 'is_closing' || stateKind === 'is_closed') {
      head?.appendField(new Blockly.FieldDropdown(coverBooleanOptions), 'ATTR_BOOL');
    }
  },
};

export const conditionStateBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray(
    STATE_DOMAINS
      .filter((domain) => domain !== 'cover')
      .map(domain => ({
        type: `condition_state_${domain}`,
        message0: `${domain} %1 is %2 %3`,
        args0: [
          { type: 'field_dropdown', name: 'ENTITY_ID', options: () => getEntitiesByDomain(domain) },
          { type: 'field_dropdown', name: 'STATE', options: () => getStates(domain) },
          { type: 'input_value', name: 'MOD', check: 'HA_CONDITION_MOD' },
        ],
        previousStatement: 'HA_CONDITION',
        nextStatement: 'HA_CONDITION',
        colour: '#AECA3E',
        tooltip: `${domain} 엔티티의 상태를 검사합니다.`,
        helpUrl: '',
        mutator: 'ha_condition_optional_data',
      }))
  );

Blockly.Blocks['condition_data_attribute'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('attribute')
      .appendField(new Blockly.FieldTextInput('effect'), 'VALUE');
    this.setPreviousStatement(true, 'HA_CONDITION_DATA');
    this.setNextStatement(true, 'HA_CONDITION_DATA');
    this.setColour('#AECA3E');
    this.setTooltip('state condition의 attribute 값을 설정합니다.');
    this.setHelpUrl('');
  },
};

Blockly.Blocks['condition_data_state'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('state')
      .appendField(new Blockly.FieldTextInput('Plantgrowth'), 'VALUE');
    this.setPreviousStatement(true, 'HA_CONDITION_DATA');
    this.setNextStatement(true, 'HA_CONDITION_DATA');
    this.setColour('#AECA3E');
    this.setTooltip('state condition의 state 값을 텍스트로 설정합니다.');
    this.setHelpUrl('');
  },
};
