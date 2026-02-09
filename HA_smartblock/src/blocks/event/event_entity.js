// src/blocks/event/event_entity.js
import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities.js';
import { STATE_DOMAINS, getStates } from '../../data/options.js';

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
function withAny(options) {
  const opts = (options || []).filter(([, v]) => v); // '(No states)' 같은 빈 값 제거
  if (!opts.length) return [['(any)', '']];
  return [...opts, ['(any)', '']];
}

const labelOf = (domain) => (domain === 'binary_sensor' ? 'binary sensor' : domain);

export const eventEntityBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
    ...STATE_DOMAINS
      .filter(d => d !== 'sensor') // sensor는 numeric_state로 따로
      .map(domain => ({
        type: `event_${domain}_state`,
        message0: `${labelOf(domain)} %1 from %2 to %3 %4`,
        args0: [
          { type: 'field_dropdown', name: 'ENTITY_ID', options: () => getEntityOptions(domain) },
          { type: 'field_dropdown', name: 'FROM', options: () => withAny(getStates(domain)) },
          { type: 'field_dropdown', name: 'TO', options: () => withAny(getStates(domain)) },
          { type: 'input_value', name: 'FOR' },
        ],
        previousStatement: 'HA_EVENT',
        nextStatement: 'HA_EVENT',
        colour: 180,
        tooltip: `${domain} 엔티티의 상태 변화(state)를 트리거합니다.`,
        helpUrl: '',
      })),

    {
      type: 'event_sensor_numeric_state',
      message0: `sensor %1 above %2 below %3 %4`,
      args0: [
        { type: 'field_dropdown', name: 'ENTITY_ID', options: () => getEntityOptions('sensor', { numericOnly: true }) },
        { type: 'field_number', name: 'ABOVE', value: 0, precision: 0.1 },
        { type: 'field_number', name: 'BELOW', value: 0, precision: 0.1 },
        { type: 'input_value', name: 'FOR', check: 'DURATION' },
      ],
      previousStatement: 'HA_EVENT',
      nextStatement: 'HA_EVENT',
      colour: 180,
      tooltip: 'sensor의 값이 above/below 조건을 만족할 때 트리거합니다.',
      helpUrl: '',
    },
  ]);
