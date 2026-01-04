// src/data/options.js
// ------------------------------------------------------------
// Domain-centric option spec for Blockly blocks (Action / Condition / Event)
// - Keep "actions" (service-like) and "states" (state strings) separated.
// - Add more domains/spec fields over time (attributes, numeric ranges, etc.)
// ------------------------------------------------------------

/**
 * DOMAIN_SPEC structure
 * {
 *   [domain]: {
 *     actions?: [ [label, value], ... ]  // for action blocks (service calls)
 *     states?:  [ [label, value], ... ]  // for condition/state comparisons
 *     // (optional future) attributes?: ...
 *   }
 * }
 */
export const DOMAIN_SPEC = {
  light: {
    actions: [ ['on', 'turn_on'], ['off', 'turn_off'], ],
    states: [ ['on', 'on'], ['off', 'off'], ],
  },
  switch: {
    actions: [ ['on', 'turn_on'], ['off', 'turn_off'], ],
    states: [ ['on', 'on'], ['off', 'off'], ],
  },
  lock: {
    actions: [ ['lock', 'lock'], ['unlock', 'unlock'], ],
    states: [ ['locked', 'locked'], ['unlocked', 'unlocked'], ],
  },
  media_player: {
    actions: [ ['play', 'media_play'], ['pause', 'media_pause'], ['stop', 'media_stop'], ['next', 'media_next_track'],
               ['previous', 'media_previous_track'], ['volume up', 'volume_up'], ['volume down', 'volume_down'], ],
    states: [ ['playing', 'playing'], ['paused', 'paused'], ['idle', 'idle'], ['standby', 'standby'], ['off', 'off'], ],
  },
  climate: {
    actions: [  ['on', 'turn_on'], ['off', 'turn_off'], ['set_temperature', 'set_temperature'], ],
    states: [ ['heat', 'heat'], ['cool', 'cool'], ['auto', 'auto'], ['off', 'off'],],
  },
  cover: {
    actions: [ ['open', 'open_cover'], ['close', 'close_cover'], ['stop', 'stop_cover'], ],
    states: [ ['open', 'open'], ['closed', 'closed'], ['opening', 'opening'], ['closing', 'closing'], ['stopped', 'stopped'], ],
  },

  binary_sensor: {
    states: [ ['on', 'on'], ['off', 'off'], ],
  },

  input_boolean: {
    states: [ ['on', 'on'], ['off', 'off'], ],
  },

  // 필요하면 계속 추가:
  // sensor: { ... } (주로 numeric_state 조건에 쓰게 될 가능성이 큼)
  // fan: { actions: ..., states: ... }
  // alarm_control_panel: { actions: ..., states: ... }
};

/** Domains that have actions */
export const ACTION_DOMAINS = Object.entries(DOMAIN_SPEC)
  .filter(([, spec]) => Array.isArray(spec.actions) && spec.actions.length > 0)
  .map(([domain]) => domain);

/** Domains that have states */
export const STATE_DOMAINS = Object.entries(DOMAIN_SPEC)
  .filter(([, spec]) => Array.isArray(spec.states) && spec.states.length > 0)
  .map(([domain]) => domain);

/** Safe getter for action options */
export function getActions(domain) {
  const opts = DOMAIN_SPEC[domain]?.actions;
  return Array.isArray(opts) && opts.length ? opts : [['(No actions)', '']];
}

/** Safe getter for state options */
export function getStates(domain) {
  const opts = DOMAIN_SPEC[domain]?.states;
  return Array.isArray(opts) && opts.length ? opts : [['(No states)', '']];
}

// ------------------------------------------------------------
// Condition-related operator options (domain-agnostic)
// Use these in condition blocks (numeric_state, state, etc.)
// ------------------------------------------------------------

/** For numeric_state comparisons */
export const NUMERIC_OPERATORS = [
  ['>', '>'],
  ['≥', '>='],
  ['<', '<'],
  ['≤', '<='],
  ['==', '=='],
];

/** For "state" condition comparisons (if you model is/is_not) */
export const STATE_COMPARATORS = [
  ['is', 'is'],
  ['is_not', 'is_not'],
];

// ------------------------------------------------------------
// Event-related options (minimal starter; extend as you implement)
// ------------------------------------------------------------

export const EVENT_TYPES = [
  ['state', 'state'],
  // ['time', 'time'],
  // ['sun', 'sun'],
  // ['mqtt', 'mqtt'],
];

// src/data/options.js
import { notifyDevices } from './entities.js';

// ---- notify helpers ----
export const slug = (s) => String(s || '')
  .trim().toLowerCase()
  .replace(/\s+/g, '_')
  .replace(/[^a-z0-9_]+/g, '');

// YAML에서 사용하는 커스텀 서비스들(접두사 없이 보관)
export const CUSTOM_NOTIFY_TARGETS = [
  'USER1_devices',
  'USER2_devices',
];

export const PRESET_NOTIFY_SERVICES = [
  'persistent_notification', 'email', 'file', 'all',
  'telegram', 'telegram_bot', 'discord', 'line', 'slack', 'twilio',
  'alexa_media', 'androidtv', 'firetv', 'google_assistant_broadcast',
];

// 사용자 기기 → mobile_app_<name> 처럼 만들거면(현재는 slug만)
// Generator에서 prefix를 붙일지/여기서 붙일지 한 군데로 통일 추천
export function buildDeviceTargets() {
  return (notifyDevices || []).map((n) => `${slug(n)}`);
}

// field_dropdown options 함수로 바로 꽂을 수 있게 export
export function getNotifyTargetOptions() {
  const opts = [];

  // 기본 notify.notify (도메인/서비스 형태에서 service만 선택하는 UI라면 이 값은 'notify'로 유지)
  opts.push(['notify', 'notify']); // YAML에선 notify.notify 가 됨(Generator에서 처리)

  // YAML 커스텀 서비스들
  CUSTOM_NOTIFY_TARGETS.forEach(v => opts.push([v, v]));

  // mobile_app 기기들
  const devices = buildDeviceTargets();
  if (devices.length) devices.forEach(v => opts.push([v, v]));
  else opts.push(['(no mobile_app devices)', 'notify']);

  // preset 서비스들
  PRESET_NOTIFY_SERVICES.forEach(v => opts.push([v, v]));

  return opts;
}

// 템플릿 kind 옵션도 data로 분리 가능
export const NOTIFY_TEMPLATE_KINDS = [
  ['trigger entity id', 'TRIGGER_ENTITY_ID'],
  ['trigger friendly name', 'TRIGGER_FRIENDLY_NAME'],
  ['trigger new state', 'TRIGGER_NEW_STATE'],
  ['trigger old state', 'TRIGGER_OLD_STATE'],

  ['now()', 'NOW'],
  ['current date', 'DATE'],
  ['current time (HH:MM)', 'TIME_HM'],
  ['weekday name', 'WEEKDAY'],

  ['user name', 'USER_NAME'],
  ['user language', 'USER_LANG'],
  ['user id', 'USER_ID'],
];

// src/data/options.js
import { dummyEntities } from './entities.js';

/* ------------------------------------------------------------------
 * Group Action options (domain -> service, domain -> entity options)
 * ------------------------------------------------------------------ */

export const GROUP_ACTION_DOMAINS = [
  ['cover', 'cover'],
  ['light', 'light'],
];

export const GROUP_DOMAIN_TO_SERVICE_OPTIONS = {
  cover: [
    ['open', 'open_cover'],
    ['close', 'close_cover'],
    ['stop', 'stop_cover'],
  ],
  light: [
    ['on', 'turn_on'],
    ['off', 'turn_off'],
  ],
};

/**
 * Return entity dropdown options for a given domain, with placeholder first.
 * Placeholder label: '-'  value: ''  (means "not selected")
 */
export function getDomainEntityOptionsWithPlaceholder(domain) {
  const list = dummyEntities.filter(e => e.entity_id.startsWith(`${domain}.`));
  const opts = list.map(e => [
    e.attributes?.friendly_name || e.entity_id,
    e.entity_id,
  ]);

  // placeholder at the top
  opts.unshift(['-', '']);
  return opts;
}

/**
 * Used as Blockly dropdown options callback for child entity item blocks.
 * It inspects parent block's DOMAIN field.
 */
export function getGroupEntityOptions() {
  const field = this;
  const block = field.getSourceBlock?.() || field.getParent?.();
  const parent = block?.getSurroundParent?.() || block?.parentBlock_;

  let domain = 'cover';
  if (parent?.getField?.('DOMAIN')) {
    domain = parent.getFieldValue('DOMAIN') || 'cover';
  }
  return getDomainEntityOptionsWithPlaceholder(domain);
}

/** Convenience: service options getter (for extension logic) */
export function getGroupServiceOptionsByDomain(domain) {
  return GROUP_DOMAIN_TO_SERVICE_OPTIONS[domain] || [];
}