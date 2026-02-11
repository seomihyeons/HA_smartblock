// src/data/options.js
// ------------------------------------------------------------
// Domain-centric option spec for Blockly blocks
// (Action / Condition / Event / Notify / Group Action)
// ------------------------------------------------------------

import { dummyEntities, notifyDevices } from './entities_index.js';

/* ============================================================
 * DOMAIN SPEC (actions / states)
 * ============================================================ */

export const DOMAIN_SPEC = {
  light: {
    actions: [
      ['on', 'turn_on'],
      ['off', 'turn_off'],
    ],
    states: [
      ['on', 'on'],
      ['off', 'off'],
    ],
  },

  switch: {
    actions: [
      ['on', 'turn_on'],
      ['off', 'turn_off'],
    ],
    states: [
      ['on', 'on'],
      ['off', 'off'],
    ],
  },

  lock: {
    actions: [
      ['lock', 'lock'],
      ['unlock', 'unlock'],
    ],
    states: [
      ['locked', 'locked'],
      ['unlocked', 'unlocked'],
    ],
  },

  media_player: {
    actions: [
      ['play', 'media_play'],
      ['pause', 'media_pause'],
      ['stop', 'media_stop'],
      ['next', 'media_next_track'],
      ['previous', 'media_previous_track'],
      ['volume up', 'volume_up'],
      ['volume down', 'volume_down'],
    ],
    states: [
      ['playing', 'playing'],
      ['paused', 'paused'],
      ['idle', 'idle'],
      ['standby', 'standby'],
      ['off', 'off'],
    ],
  },

  climate: {
    actions: [
      ['on', 'turn_on'],
      ['off', 'turn_off'],
      ['set temperature', 'set_temperature'],
    ],
    states: [
      ['heat', 'heat'],
      ['cool', 'cool'],
      ['auto', 'auto'],
      ['off', 'off'],
    ],
  },

  cover: {
    actions: [
      ['open', 'open_cover'],
      ['close', 'close_cover'],
      ['stop', 'stop_cover'],
    ],
    states: [
      ['open', 'open'],
      ['closed', 'closed'],
      ['opening', 'opening'],
      ['closing', 'closing'],
      ['stopped', 'stopped'],
    ],
  },

  binary_sensor: {
    states: [
      ['on', 'on'],
      ['off', 'off'],
    ],
  },

  input_boolean: {
    states: [
      ['on', 'on'],
      ['off', 'off'],
    ],
  },
  sun: {
    states: [
      ['above horizon', 'above_horizon'],
      ['below horizon', 'below_horizon'],
    ],
  },
};

/* ============================================================
 * DOMAIN FILTER HELPERS
 * ============================================================ */

export const ACTION_DOMAINS = Object.entries(DOMAIN_SPEC)
  .filter(([, spec]) => Array.isArray(spec.actions) && spec.actions.length > 0)
  .map(([domain]) => domain);

export const STATE_DOMAINS = Object.entries(DOMAIN_SPEC)
  .filter(([, spec]) => Array.isArray(spec.states) && spec.states.length > 0)
  .map(([domain]) => domain);

export function getActions(domain) {
  const opts = DOMAIN_SPEC[domain]?.actions;
  return Array.isArray(opts) && opts.length ? opts : [['(No actions)', '']];
}

export function getStates(domain) {
  const opts = DOMAIN_SPEC[domain]?.states;
  return Array.isArray(opts) && opts.length ? opts : [['(No states)', '']];
}

/* ============================================================
 * CONDITION / EVENT OPTIONS
 * ============================================================ */

export const NUMERIC_OPERATORS = [
  ['>', '>'],
  ['≥', '>='],
  ['<', '<'],
  ['≤', '<='],
  ['==', '=='],
];

export const STATE_COMPARATORS = [
  ['is', 'is'],
  ['is_not', 'is_not'],
];

export const EVENT_TYPES = [
  ['state', 'state'],
];

/* ============================================================
 * CAMERA ENTITY OPTIONS (notify tag 용)
 * ============================================================ */

export const getCameraEntityOptions = () => {
  const cams = (dummyEntities || []).filter(
    (e) => (e.entity_id || '').startsWith('camera.')
  );

  if (!cams.length) return [['(no camera)', '']];

  return cams.map((e) => [
    e.attributes?.friendly_name || e.entity_id,
    e.entity_id,
  ]);
};

/* ============================================================
 * NOTIFY OPTIONS
 * ============================================================ */

export const slug = (s) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]+/g, '');

export const CUSTOM_NOTIFY_TARGETS = [
  'USER1_devices',
  'USER2_devices',
];

export const PRESET_NOTIFY_SERVICES = [
  'persistent_notification',
  'email',
  'file',
  'all',
  'telegram',
  'telegram_bot',
  'discord',
  'line',
  'slack',
  'twilio',
  'alexa_media',
  'androidtv',
  'firetv',
  'google_assistant_broadcast',
];

export function buildDeviceTargets() {
  return (notifyDevices || []).map((n) => slug(n));
}

export function getNotifyTargetOptions() {
  const opts = [];

  // 기본 notify.notify
  opts.push(['notify', 'notify']);

  // 커스텀 notify 서비스
  CUSTOM_NOTIFY_TARGETS.forEach((v) => opts.push([v, v]));

  // mobile_app 디바이스들
  const devices = buildDeviceTargets();
  if (devices.length) {
    devices.forEach((v) => opts.push([v, v]));
  } else {
    opts.push(['(no mobile_app devices)', 'notify']);
  }

  // preset 서비스
  PRESET_NOTIFY_SERVICES.forEach((v) => opts.push([v, v]));

  return opts;
}

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

/* ============================================================
 * GROUP ACTION OPTIONS (light / cover)
 * ============================================================ */

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

export function getDomainEntityOptionsWithPlaceholder(domain) {
  const list = (dummyEntities || []).filter((e) =>
    e.entity_id.startsWith(`${domain}.`)
  );

  const opts = list.map((e) => [
    e.attributes?.friendly_name || e.entity_id,
    e.entity_id,
  ]);

  opts.unshift(['-', '']);
  return opts;
}

export function getGroupEntityOptions() {
  const field = this;
  const block = field?.getSourceBlock?.() || field?.getParent?.();
  const parent = block?.getSurroundParent?.() || block?.parentBlock_;

  let domain = 'light';
  if (parent?.getField?.('DOMAIN')) {
    domain = parent.getFieldValue('DOMAIN') || domain;
  }

  return getDomainEntityOptionsWithPlaceholder(domain);
}

export function getGroupServiceOptionsByDomain(domain) {
  return GROUP_DOMAIN_TO_SERVICE_OPTIONS[domain] || [];
}
