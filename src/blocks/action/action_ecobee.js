import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities_index.js';

const ECOBEE_SERVICE_OPTIONS = [
  ['resume_program', 'resume_program'],
  ['set_fan_min_on_time', 'set_fan_min_on_time'],
  ['set_dst_mode', 'set_dst_mode'],
  ['set_mic_mode', 'set_mic_mode'],
  ['set_occupancy_modes', 'set_occupancy_modes'],
  ['create_vacation', 'create_vacation'],
  ['delete_vacation', 'delete_vacation'],
  ['set_sensors_in_climate', 'set_sensors_in_climate'],
];

const REQUIRED_ENTITY_SERVICES = new Set([
  'create_vacation',
  'delete_vacation',
  'set_sensors_in_climate',
]);

function getEcobeeEntityOptions() {
  const rows = (dummyEntities || []).filter((e) => {
    const id = String(e.entity_id || '');
    return id.startsWith('climate.');
  });
  if (!rows.length) return [['(No climate entities)', '']];
  return rows.map((e) => [e.attributes?.friendly_name || e.entity_id, e.entity_id]);
}

function serviceRequiresEntity(service) {
  return REQUIRED_ENTITY_SERVICES.has(String(service || '').trim());
}

function collectDataKeys(block) {
  const keys = new Set();
  const input = block.getInput('DATA');
  let child = input?.connection?.targetBlock?.() || null;
  while (child) {
    if (child.type === 'action_data_kv_text') {
      const k = String(child.getFieldValue('KEY') || '').trim().toLowerCase();
      if (k) keys.add(k);
    } else if (child.type === 'action_data_climate_preset_mode') {
      keys.add('preset_mode');
    }
    child = child.getNextBlock();
  }
  return keys;
}

function syncEntityInput(block) {
  if (!block) return;

  const service = String(block.getFieldValue('SERVICE') || '').trim();
  const required = serviceRequiresEntity(service);
  const useEntityField = block.getField('USE_ENTITY');
  const entityField = block.getField('ENTITY_ID');

  if (!useEntityField || !entityField) return;

  if (required) {
    useEntityField.setValue('TRUE');
    useEntityField.setVisible(false);
  } else {
    useEntityField.setVisible(true);
  }

  const useEntity = required || block.getFieldValue('USE_ENTITY') === 'TRUE';
  entityField.setVisible(useEntity);

  if (block.rendered) block.render();
}

const REQUIRED_KEYS_BY_SERVICE = {
  resume_program: ['resume_all'],
  set_fan_min_on_time: ['fan_min_on_time'],
  set_dst_mode: ['dst_enabled'],
  set_mic_mode: ['mic_enabled'],
  delete_vacation: ['vacation_name'],
  create_vacation: ['vacation_name', 'cool_temp', 'heat_temp'],
  set_sensors_in_climate: ['sensors'],
};

Blockly.Extensions.register('action_ecobee_dynamic_entity', function () {
  this.updateEcobeeEntityUi_ = () => syncEntityInput(this);
  const prevOnChange = this.onchange;
  this.setOnChange((e) => {
    if (typeof prevOnChange === 'function') prevOnChange.call(this, e);
    if (!e) return;
    const type = String(e.type || '');
    if (
      type === Blockly.Events.BLOCK_CHANGE ||
      type === Blockly.Events.BLOCK_MOVE ||
      type === Blockly.Events.BLOCK_CREATE
    ) {
      syncEntityInput(this);
    }
  });
  syncEntityInput(this);
});

Blockly.Extensions.register('action_ecobee_required_warning', function () {
  const updateWarning = () => {
    const service = String(this.getFieldValue('SERVICE') || '').trim();
    const required = REQUIRED_KEYS_BY_SERVICE[service] || [];
    const warnings = [];

    if (serviceRequiresEntity(service)) {
      const eid = String(this.getFieldValue('ENTITY_ID') || '').trim();
      if (!eid) warnings.push('Missing required field: entity_id');
    }

    if (required.length) {
      const keys = collectDataKeys(this);
      const missing = required.filter((k) => !keys.has(k));
      if (missing.length) {
        warnings.push(`Missing required data key(s): ${missing.join(', ')}`);
      }
    }

    this.setWarningText(warnings.length ? warnings.join('\n') : null);
  };

  const prevOnChange = this.onchange;
  this.setOnChange((e) => {
    if (typeof prevOnChange === 'function') prevOnChange.call(this, e);
    if (!e) return;
    updateWarning();
  });
  updateWarning();
});

export const actionEcobeeBlocks = Blockly.common.createBlockDefinitionsFromJsonArray([
  {
    type: 'action_ecobee_service',
    message0: 'ecobee %1 entity %2 %3',
    args0: [
      { type: 'field_dropdown', name: 'SERVICE', options: ECOBEE_SERVICE_OPTIONS },
      { type: 'field_checkbox', name: 'USE_ENTITY', checked: false },
      { type: 'field_dropdown', name: 'ENTITY_ID', options: getEcobeeEntityOptions },
    ],
    inputsInline: true,
    previousStatement: 'HA_ACTION',
    nextStatement: 'HA_ACTION',
    colour: '#E3CC57',
    tooltip: 'Ecobee integration action block. Configure required keys in data.',
    helpUrl: '',
    mutator: 'ha_action_optional_data',
    extensions: ['action_ecobee_dynamic_entity', 'action_ecobee_required_warning'],
  },
]);
