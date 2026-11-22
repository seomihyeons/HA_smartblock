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
      tooltip: `Runs an action for the selected ${domain} entity.`,
      helpUrl: '',
      mutator: 'ha_action_optional_data',
      extensions: ['action_entity_template_input'],
    }))
  );


/**
 * Study-friendly device action. Unlike action_homeassistant, its menu and
 * generated service are derived from the selected Entity's domain.
 *
 * Keep action_homeassistant registered for lossless import of legacy
 * homeassistant.turn_on/off/toggle YAML; only newly authored actions use this.
 */
export function getSmartActionDomain(entityId) {
  const domain = String(entityId || '').split('.', 1)[0];
  return HOMEASSISTANT_TARGET_DOMAINS.includes(domain) && getActions(domain)[0]?.[1]
    ? domain : '';
}

export function getSmartActionOptions(entityId) {
  const domain = getSmartActionDomain(entityId);
  return domain ? getActions(domain) : [['Select an entity', '']];
}

function getSmartEntityOptions() {
  const options = getEntityOptions('homeassistant')
    .filter(([, id]) => getSmartActionDomain(id));
  return options.length ? options : [['(No compatible entities)', '']];
}

Blockly.Extensions.register('action_smart_sync_domain', function () {
  const entityField = this.getField('ENTITY_ID');
  const actionField = this.getField('ACTION');
  if (!entityField || !actionField) return;

  const syncAction = () => {
    if (this.isDisposed?.()) return;
    const validActions = getSmartActionOptions(this.getFieldValue('ENTITY_ID'));
    // Force Blockly to refresh the dynamic menu before validating the new value.
    actionField.getOptions(false);
    const current = actionField.getValue();
    if (!validActions.some(([, value]) => value === current)) {
      actionField.setValue(validActions[0][1]);
    }
    actionField.forceRerender?.();
  };

  // A FieldDropdown validator runs before ENTITY_ID has its new value.
  // Reconcile ACTION after the Entity field finishes applying its change.
  entityField.setValidator((newValue) => {
    setTimeout(syncAction, 0);
    return newValue;
  });
  syncAction();
});

export const actionSmartBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([{
    type: 'action_smart',
    message0: 'device %1 to %2',
    args0: [
      { type: 'field_dropdown', name: 'ENTITY_ID', options: getSmartEntityOptions },
      {
        type: 'field_dropdown',
        name: 'ACTION',
        options: function () {
          return getSmartActionOptions(this.getSourceBlock?.()?.getFieldValue('ENTITY_ID'));
        },
      },
    ],
    previousStatement: 'HA_ACTION',
    nextStatement: 'HA_ACTION',
    colour: '#E3CC57',
    tooltip: 'Choose a device; available actions follow its domain.',
    helpUrl: '',
    mutator: 'ha_action_optional_data',
    extensions: ['action_smart_sync_domain'],
  }]);
