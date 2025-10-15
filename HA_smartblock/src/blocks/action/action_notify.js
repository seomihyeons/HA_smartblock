// src/blocks/action/action_notify.js
import * as Blockly from 'blockly';
import { notifyDevices } from '../../data/entities';

const slug = (s) => String(s || '')
  .trim().toLowerCase()
  .replace(/\s+/g, '_')
  .replace(/[^a-z0-9_]+/g, '');

// 사전 정의 프리셋(접두사 없이 보관)
const PRESET_SERVICES = [
  // (시스템/표준)
  'persistent_notification', 'email', 'file', 'all',
  // (메시징)
  'telegram', 'telegram_bot', 'discord', 'line', 'slack', 'twilio',
  // (기기/플랫폼)
  'alexa_media', 'androidtv', 'firetv', 'google_assistant_broadcast',
];

// 사용자 기기 → mobile_app_<name> (접두사 없음)
function buildDeviceTargets() {
  return (notifyDevices || []).map((n) => `mobile_app_${slug(n)}`);
}

// 드롭다운 옵션(라벨=값, 접두사 없이 표시/저장)
function getNotifyTargetOptions() {
  const opts = [];
  // 기본 채널
  opts.push(['notify', 'notify']); // YAML에선 notify.notify 가 됨

  const devices = buildDeviceTargets();
  if (devices.length) devices.forEach(v => opts.push([v, v]));
  else opts.push(['(no mobile_app devices)', 'notify']); // 선택하면 기본으로 고정

  PRESET_SERVICES.forEach(v => opts.push([v, v]));
  return opts;
}


export const actionNotifyBlocks = Blockly.common.createBlockDefinitionsFromJsonArray([
  {
    "type": "action_notify",
    "message0": "notify %1  message %2  %3",
    "args0": [
      { "type": "field_dropdown", "name": "TARGET",  "options": getNotifyTargetOptions },
      { "type": "field_input",    "name": "MESSAGE", "text": "message", "spellcheck": true },
      { "type": "input_value",    "name": "TITLE",   "check": "HA_NOTIFY_TITLE" }
    ],
    "previousStatement": "HA_ACTION",
    "nextStatement": "HA_ACTION",
    "colour": "#E3CC57",
    "tooltip": "notify.<대상>을 드롭다운에서 선택. message는 필수, title은 선택(값 블록 연결).",
    "helpUrl": ""
  },
  {
    "type": "action_notify_title",
    "message0": "title %1",
    "args0": [
      { "type": "field_input", "name": "TITLE", "text": "", "spellcheck": true }
    ],
    "output": "HA_NOTIFY_TITLE",
    "colour": "#E3CC57",
    "tooltip": "Notify 제목(선택). notify 블록의 title 입력에 꽂아 사용.",
    "helpUrl": ""
  }
]);
