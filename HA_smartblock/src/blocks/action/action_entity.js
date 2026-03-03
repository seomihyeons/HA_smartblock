// src/blocks/action/action_entity.js
import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities_index.js';
import { ACTION_DOMAINS, HOMEASSISTANT_TARGET_DOMAINS, getActions } from '../../data/options.js';

const TEMPLATE_ENTITY_VALUE = '__template__';

function getEntityOptions(domain) {
  const filtered = (dummyEntities || []).filter((e) => {
    const id = String(e.entity_id || '');
    if (!id) return false;

    if (domain === 'ecobee') {
      return id.startsWith('climate.');
    }

    if (domain === 'homeassistant') {
      const d = id.includes('.') ? id.split('.', 1)[0] : '';
      return HOMEASSISTANT_TARGET_DOMAINS.includes(d);
    }

    return id.startsWith(`${domain}.`);
  });
  const opts = filtered.map(e => [e.attributes?.friendly_name || e.entity_id, e.entity_id]);
  if (!opts.length) opts.push(['(No entities)', '']);
  opts.push(['template', TEMPLATE_ENTITY_VALUE]);
  return opts;
}

Blockly.Extensions.register('action_entity_template_input', function () {
  const entityField = this.getField('ENTITY_ID');
  const templateLabel = this.getField('TEMPLATE_LABEL');
  const templateField = this.getField('TEMPLATE_ENTITY');
  if (!entityField) return;

  const updateShape = () => {
    const isTemplate = this.getFieldValue('ENTITY_ID') === TEMPLATE_ENTITY_VALUE;
    if (templateLabel) templateLabel.setVisible(isTemplate);
    if (templateField) templateField.setVisible(isTemplate);
    this.render?.();
  };

  entityField.setValidator((newVal) => {
    setTimeout(updateShape, 0);
    return newVal;
  });

  this.setInputsInline(true);
  updateShape();
});

export const actionEntityBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray(
    ACTION_DOMAINS.map(domain => ({
      type: `action_${domain}`,
      message0: `${domain} %1 to %2 %3 %4`,
      args0: [
        { type: 'field_dropdown', name: 'ENTITY_ID', options: () => getEntityOptions(domain) },
        { type: 'field_dropdown', name: 'ACTION', options: () => getActions(domain) },
        { type: 'field_label_serializable', name: 'TEMPLATE_LABEL', text: 'entity' },
        { type: 'field_input', name: 'TEMPLATE_ENTITY', text: '{{ trigger.entity_id }}' },
      ],
      previousStatement: ['HA_ACTION', `HA_ACTION_${domain}`],
      nextStatement: ['HA_ACTION', `HA_ACTION_${domain}`],
      colour: '#E3CC57',
      tooltip: `${domain} 엔티티에 대한 액션을 실행합니다.`,
      helpUrl: '',
      mutator: 'ha_action_optional_data',
      extensions: ['action_entity_template_input'],
    }))
  );
