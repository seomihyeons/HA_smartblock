// src/blocks/condition/condition_state.js
import * as Blockly from 'blockly';
import { dummyEntities } from '../../data/entities.js';

// 도메인별 필터
function getEntitiesByDomain(domain) {
  return dummyEntities
    .filter(e => e.entity_id.startsWith(domain + '.'))
    .map(e => [e.attributes?.friendly_name || e.entity_id, e.entity_id]);
}

// 공통 옵션
const stateOptions = {
  light: [["on", "on"], ["off", "off"]],
  switch: [["on", "on"], ["off", "off"]],
  lock: [["locked", "locked"], ["unlocked", "unlocked"]],
  media_player: [
    ["playing", "playing"],
    ["paused", "paused"],
    ["idle", "idle"],
    ["standby", "standby"],
    ["off", "off"]
  ],
  binary_sensor: [["on", "on"], ["off", "off"]],
  climate: [
    ["heat", "heat"],
    ["cool", "cool"],
    ["auto", "auto"],
    ["off", "off"],
  ]
};

// 도메인 목록
const domains = Object.keys(stateOptions);

export const conditionStateBlocks =
  Blockly.common.createBlockDefinitionsFromJsonArray(
    domains.map(domain => ({
      type: `condition_state_${domain}`,
      message0: `${domain} %1 is %2`,
      args0: [
        { type: "field_dropdown", name: "ENTITY_ID", options: () => getEntitiesByDomain(domain) },
        { type: "field_dropdown", name: "STATE", options: stateOptions[domain] }
      ],
      previousStatement: "HA_CONDITION",
      nextStatement: "HA_CONDITION",
      colour: "#AECA3E",
      tooltip: `${domain} 엔티티의 상태를 검사합니다.`,
      helpUrl: ""
    }))
  );
