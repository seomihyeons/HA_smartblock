// src/blocks/event/event_entity.js
import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities.js';
import { STATE_DOMAINS, getStates } from '../../data/options.js';

// 도메인별 엔티티 드롭다운 (없으면 placeholder)
function getEntityOptionsByDomain(domain) {
  const filtered = dummyEntities.filter(e => e.entity_id.startsWith(`${domain}.`));
  if (!filtered.length) return [['(No entities)', '']];
  return filtered.map(e => [e.attributes?.friendly_name || e.entity_id, e.entity_id]);
}

// 상태 드롭다운: 특정 도메인 states + (any) 옵션
function getStateOptionsWithAny(domain) {
  const base = getStates(domain); // options.js에서 가져온 states
  const any = [['(any)', '*']];
  return any.concat(base);
}

// 엔티티 기반 "state trigger" 블록들 (도메인별 자동 생성)
export const eventEntityBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray([
    // 1) DOMAIN_SPEC에 states가 정의된 도메인들 (light/switch/lock/binary_sensor/cover/...)
    ...STATE_DOMAINS.map(domain => ({
      type: `event_${domain}_state`,
      message0: `when ${domain} %1 becomes %2`,
      args0: [
        { type: 'field_dropdown', name: 'ENTITY_ID', options: () => getEntityOptionsByDomain(domain) },
        { type: 'field_dropdown', name: 'TO_STATE', options: () => getStateOptionsWithAny(domain) },
      ],
      // 프로젝트에 맞게 타입 이름을 통일하세요 (HA_EVENT / HA_TRIGGER 등)
      previousStatement: 'HA_EVENT',
      nextStatement: 'HA_EVENT',
      colour: '#5BA58C',
      tooltip: `${domain} 엔티티의 상태 변경을 트리거로 사용합니다.`,
      helpUrl: '',
    })),

    // 2) sensor 전용 (연속값/문자열 값이라 states 목록이 없다고 가정)
    // 필요 없으면 삭제해도 됨. (기존 event_sensor_state.js를 대체하려면 유지)
    {
      type: 'event_sensor_state',
      message0: 'when sensor %1 becomes %2',
      args0: [
        { type: 'field_dropdown', name: 'ENTITY_ID', options: () => getEntityOptionsByDomain('sensor') },
        { type: 'field_input', name: 'TO_STATE', text: '*' }, // '*' = any / 혹은 특정 값 문자열
      ],
      previousStatement: 'HA_EVENT',
      nextStatement: 'HA_EVENT',
      colour: '#5BA58C',
      tooltip: 'sensor 엔티티의 상태 변경을 트리거로 사용합니다. (값은 문자열로 비교)',
      helpUrl: '',
    },
  ]);

