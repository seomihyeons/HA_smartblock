// src/blocks/event/event_entity.js
import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities_index.js';
import { STATE_DOMAINS, getBinarySensorStateOptions, getStates } from '../../data/options.js';

function getEntityOptions(domain, { numericOnly = false } = {}) {
  const filtered = (dummyEntities || []).filter(e => {
    const id = String(e.entity_id || '');
    if (!id.startsWith(`${domain}.`)) return false;
    if (!numericOnly) return true;
    return !Number.isNaN(Number(e.state));
  });

  if (!filtered.length) return [['(No entities)', '']];
  return filtered.map(e => [e.attributes?.friendly_name || e.entity_id, e.entity_id]);
}

// getStates(domain) = [['on','on'], ...] 그대로 쓰되 (any) 옵션만 추가
function withAny(options, { anyFirst = false } = {}) {
  const opts = (options || []).filter(([, v]) => v); // '(No states)' 같은 빈 값 제거
  if (!opts.length) return [['(any)', '']];
  const any = ['(any)', ''];
  return anyFirst ? [any, ...opts] : [...opts, any];
}

function binarySensorTriggerStateOptions({ anyFirst = false } = {}) {
  const entityId = this.getSourceBlock()?.getFieldValue('ENTITY_ID') || '';
  const options = getBinarySensorStateOptions(entityId, { includeAny: true });
  if (!anyFirst) return options;

  const any = options.find(([, value]) => value === '');
  return any ? [any, ...options.filter(([, value]) => value !== '')] : options;
}

function binarySensorTriggerFromStateOptions() {
  return binarySensorTriggerStateOptions.call(this, { anyFirst: true });
}

function refreshSemanticStateFields(block, fieldNames) {
  for (const fieldName of fieldNames) {
    const field = block.getField(fieldName);
    if (!field) continue;

    const options = field.getOptions?.(false) || [];
    const currentValue = field.getValue();
    const nextValue = options.some(([, value]) => value === currentValue)
      ? currentValue
      : options[0]?.[1];

    if (nextValue !== undefined) field.setValue(nextValue, false);
    field.forceRerender?.();
  }
}

Blockly.Extensions.register('binary_sensor_trigger_semantic_states', function () {
  const entityField = this.getField('ENTITY_ID');
  if (!entityField) return;

  const refresh = () => refreshSemanticStateFields(this, ['FROM', 'TO']);
  entityField.setValidator((newValue) => {
    // Field validators run before ENTITY_ID has been updated. Deferring lets
    // dynamic dropdowns read the newly selected runtime entity.
    queueMicrotask(refresh);
    return newValue;
  });
  refresh();
});

const labelOf = (domain) => (domain === 'binary_sensor' ? 'binary sensor' : domain);

Blockly.Extensions.register('event_trigger_optional_id', function () {
  const sync = () => {
    const useId = this.getFieldValue('USE_ID') === 'TRUE';
    const idField = this.getField('ID');
    idField?.setVisible(useId);
    if (!useId && idField) this.setFieldValue('', 'ID');
    if (this.rendered) this.render();
  };

  this.getField('USE_ID')?.setValidator((newVal) => {
    setTimeout(sync, 0);
    return newVal;
  });

  sync();
});

export const eventEntityBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
    ...STATE_DOMAINS
      .map(domain => ({
        type: `event_${domain}_state`,
        message0: `${labelOf(domain)} %1 from %2 to %3 id %4 %5 %6`,
        args0: [
          { type: 'field_dropdown', name: 'ENTITY_ID', options: () => getEntityOptions(domain) },
          {
            type: 'field_dropdown',
            name: 'FROM',
            options: domain === 'binary_sensor'
              ? binarySensorTriggerFromStateOptions
              : () => withAny(getStates(domain), { anyFirst: true }),
          },
          {
            type: 'field_dropdown',
            name: 'TO',
            options: domain === 'binary_sensor'
              ? binarySensorTriggerStateOptions
              : () => withAny(getStates(domain)),
          },
          { type: 'field_checkbox', name: 'USE_ID', checked: false },
          { type: 'field_input', name: 'ID', text: '' },
          { type: 'input_value', name: 'FOR' },
        ],
        previousStatement: 'HA_EVENT',
        nextStatement: 'HA_EVENT',
        colour: 180,
        tooltip: `Triggers when the selected ${domain} entity changes state.`,
        helpUrl: '',
        extensions: domain === 'binary_sensor'
          ? ['event_trigger_optional_id', 'binary_sensor_trigger_semantic_states']
          : ['event_trigger_optional_id'],
      })),

    {
      type: 'event_sensor_numeric_state',
      message0: `sensor %1 above %2 below %3 id %4 %5 %6`,
      args0: [
        { type: 'field_dropdown', name: 'ENTITY_ID', options: () => getEntityOptions('sensor', { numericOnly: true }) },
        { type: 'field_number', name: 'ABOVE', value: 0, precision: 0.1 },
        { type: 'field_number', name: 'BELOW', value: 0, precision: 0.1 },
        { type: 'field_checkbox', name: 'USE_ID', checked: false },
        { type: 'field_input', name: 'ID', text: '' },
        { type: 'input_value', name: 'FOR', check: 'DURATION' },
      ],
      previousStatement: 'HA_EVENT',
      nextStatement: 'HA_EVENT',
      colour: 180,
      tooltip: 'Triggers when the selected sensor value matches the above/below thresholds.',
      helpUrl: '',
      extensions: ['event_trigger_optional_id'],
    },
  ]);
