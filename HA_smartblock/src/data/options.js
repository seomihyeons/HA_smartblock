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
      ['toggle', 'toggle'],
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
      ['play media', 'play_media'],
      ['play', 'media_play'],
      ['pause', 'media_pause'],
      ['stop', 'media_stop'],
      ['clear playlist', 'clear_playlist'],
      ['join', 'join'],
      ['unjoin', 'unjoin'],
      ['select source', 'select_source'],
      ['set volume', 'volume_set'],
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
      ['set hvac mode', 'set_hvac_mode'],
      ['set temperature', 'set_temperature'],
      ['set preset mode', 'set_preset_mode'],
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
      ['toggle', 'toggle'],
      ['set position', 'set_cover_position'],
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

  fan: {
    actions: [
      ['on', 'turn_on'],
      ['off', 'turn_off'],
      ['toggle', 'toggle'],
      ['set percentage', 'set_percentage'],
      ['set preset mode', 'set_preset_mode'],
      ['oscillate', 'oscillate'],
      ['increase speed', 'increase_speed'],
      ['decrease speed', 'decrease_speed'],
    ],
    states: [
      ['on', 'on'],
      ['off', 'off'],
    ],
  },

  camera: {
    states: [
      ['idle', 'idle'],
      ['recording', 'recording'],
      ['streaming', 'streaming'],
      ['off', 'off'],
    ],
  },

  sensor: {
    states: [
      ['(any)', ''],
      ['unknown', 'unknown'],
      ['unavailable', 'unavailable'],
    ],
  },

  person: {
    states: [
      ['home', 'home'],
      ['not_home', 'not_home'],
    ],
  },

  input_boolean: {
    actions: [
      ['on', 'turn_on'],
      ['off', 'turn_off'],
      ['toggle', 'toggle'],
    ],
    states: [
      ['on', 'on'],
      ['off', 'off'],
    ],
  },

  ecobee: {
    actions: [
      ['resume program', 'resume_program'],
    ],
  },

  input_number: {
    actions: [
      ['set value', 'set_value'],
    ],
    states: [
      ['(any)', ''],
      ['unknown', 'unknown'],
      ['unavailable', 'unavailable'],
    ],
  },

  input_select: {
    actions: [
      ['select option', 'select_option'],
      ['next', 'select_next'],
      ['previous', 'select_previous'],
    ],
    states: [
      ['(any)', ''],
      ['unknown', 'unknown'],
      ['unavailable', 'unavailable'],
    ],
  },

  input_text: {
    actions: [
      ['set value', 'set_value'],
    ],
    states: [
      ['(any)', ''],
      ['unknown', 'unknown'],
      ['unavailable', 'unavailable'],
    ],
  },

  automation: {
    actions: [
      ['turn on', 'turn_on'],
      ['turn off', 'turn_off'],
      ['trigger', 'trigger'],
    ],
    states: [
      ['on', 'on'],
      ['off', 'off'],
    ],
  },

  homeassistant: {
    actions: [
      ['turn on', 'turn_on'],
      ['turn off', 'turn_off'],
      ['toggle', 'toggle'],
      ['reload config entry', 'reload_config_entry'],
    ],
  },

  backup: {
    actions: [
      ['create', 'create'],
    ],
  },

  mqtt: {
    actions: [
      ['publish', 'publish'],
    ],
  },

  script: {
    actions: [
      ['turn on', 'turn_on'],
      ['turn off', 'turn_off'],
    ],
  },

  python_script: {
    actions: [
      ['run', 'run'],
    ],
  },

  unifi: {
    actions: [
      ['reconnect client', 'reconnect_client'],
    ],
  },

  webostv: {
    actions: [
      ['select sound output', 'select_sound_output'],
    ],
  },

  zwave_js: {
    actions: [
      ['ping', 'ping'],
    ],
  },

  lifx: {
    actions: [
      ['effect pulse', 'effect_pulse'],
    ],
  },

  alarm_control_panel: {
    actions: [
      ['arm home', 'alarm_arm_home'],
      ['arm away', 'alarm_arm_away'],
      ['arm night', 'alarm_arm_night'],
      ['arm vacation', 'alarm_arm_vacation'],
      ['disarm', 'alarm_disarm'],
      ['trigger', 'alarm_trigger'],
    ],
    states: [
      ['disarmed', 'disarmed'],
      ['armed home', 'armed_home'],
      ['armed away', 'armed_away'],
      ['armed night', 'armed_night'],
      ['armed vacation', 'armed_vacation'],
      ['pending', 'pending'],
      ['arming', 'arming'],
      ['triggered', 'triggered'],
    ],
  },

  button: {
    actions: [
      ['press', 'press'],
    ],
    states: [
      ['(any)', ''],
      ['unknown', 'unknown'],
      ['unavailable', 'unavailable'],
    ],
  },

  calendar: {
    states: [
      ['on', 'on'],
      ['off', 'off'],
    ],
  },

  event: {
    states: [
      ['(any)', ''],
      ['unknown', 'unknown'],
      ['unavailable', 'unavailable'],
    ],
  },

  group: {
    actions: [
      ['turn on', 'turn_on'],
      ['turn off', 'turn_off'],
    ],
    states: [
      ['on', 'on'],
      ['off', 'off'],
    ],
  },

  humidifier: {
    actions: [
      ['on', 'turn_on'],
      ['off', 'turn_off'],
      ['set humidity', 'set_humidity'],
      ['set mode', 'set_mode'],
    ],
    states: [
      ['on', 'on'],
      ['off', 'off'],
    ],
  },

  persistent_notification: {
    actions: [
      ['dismiss', 'dismiss'],
    ],
    states: [
      ['(any)', ''],
      ['unknown', 'unknown'],
      ['unavailable', 'unavailable'],
    ],
  },

  select: {
    actions: [
      ['select option', 'select_option'],
      ['next', 'select_next'],
      ['previous', 'select_previous'],
    ],
    states: [
      ['(any)', ''],
      ['unknown', 'unknown'],
      ['unavailable', 'unavailable'],
    ],
  },

  vacuum: {
    actions: [
      ['start', 'start'],
      ['pause', 'pause'],
      ['stop', 'stop'],
      ['return to base', 'return_to_base'],
      ['clean spot', 'clean_spot'],
    ],
    states: [
      ['docked', 'docked'],
      ['cleaning', 'cleaning'],
      ['paused', 'paused'],
      ['idle', 'idle'],
      ['returning', 'returning'],
      ['error', 'error'],
    ],
  },

  valve: {
    actions: [
      ['open', 'open_valve'],
      ['close', 'close_valve'],
    ],
    states: [
      ['open', 'open'],
      ['closed', 'closed'],
    ],
  },
  weather: {
    states: [
      ['sunny', 'sunny'],
      ['cloudy', 'cloudy'],
      ['partlycloudy', 'partlycloudy'],
      ['rainy', 'rainy'],
      ['snowy', 'snowy'],
      ['windy', 'windy'],
      ['fog', 'fog'],
      ['clear-night', 'clear-night'],
      ['unknown', 'unknown'],
      ['unavailable', 'unavailable'],
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
 * CLIMATE PRESET MODE OPTIONS
 * ============================================================ */

const CLIMATE_PRESET_FALLBACKS = [
  'none',
  'home',
  'away',
  'sleep',
  'comfort',
  'eco',
  'boost',
  'activity',
  'Guest',
];

export function getClimatePresetOptions() {
  const discovered = new Set();
  (dummyEntities || [])
    .filter((e) => String(e.entity_id || '').startsWith('climate.'))
    .forEach((e) => {
      const modes = e?.attributes?.preset_modes;
      if (Array.isArray(modes)) {
        modes.forEach((m) => {
          const v = String(m || '').trim();
          if (v) discovered.add(v);
        });
      }
    });

  const merged = [...CLIMATE_PRESET_FALLBACKS];
  for (const v of discovered) {
    if (!merged.includes(v)) merged.push(v);
  }

  if (!merged.length) return [['sleep', 'sleep']];
  return merged.map((v) => [v, v]);
}

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

export const GROUP_ACTION_DOMAINS = ACTION_DOMAINS.map((domain) => [domain, domain]);

export const GROUP_DOMAIN_TO_SERVICE_OPTIONS = {
  cover: [
    ['open', 'open_cover'],
    ['close', 'close_cover'],
    ['stop', 'stop_cover'],
    ['set position', 'set_cover_position'],
  ],
  light: [
    ['on', 'turn_on'],
    ['off', 'turn_off'],
  ],
  switch: [
    ['on', 'turn_on'],
    ['off', 'turn_off'],
  ],
  fan: [
    ['on', 'turn_on'],
    ['off', 'turn_off'],
    ['set percentage', 'set_percentage'],
  ],
  lock: [
    ['lock', 'lock'],
    ['unlock', 'unlock'],
  ],
  select: [
    ['select option', 'select_option'],
    ['next', 'select_next'],
    ['previous', 'select_previous'],
  ],
  input_select: [
    ['select option', 'select_option'],
    ['next', 'select_next'],
    ['previous', 'select_previous'],
  ],
  media_player: [
    ['play media', 'play_media'],
    ['play', 'media_play'],
    ['pause', 'media_pause'],
    ['stop', 'media_stop'],
    ['clear playlist', 'clear_playlist'],
    ['join', 'join'],
    ['unjoin', 'unjoin'],
    ['select source', 'select_source'],
    ['set volume', 'volume_set'],
    ['next', 'media_next_track'],
    ['previous', 'media_previous_track'],
    ['volume up', 'volume_up'],
    ['volume down', 'volume_down'],
  ],
  homeassistant: [
    ['turn on', 'turn_on'],
    ['turn off', 'turn_off'],
    ['toggle', 'toggle'],
  ],
};

export const HOMEASSISTANT_TARGET_DOMAINS = [
  'light',
  'switch',
  'fan',
  'cover',
  'lock',
  'input_boolean',
  'automation',
  'media_player',
  'climate',
  'humidifier',
  'vacuum',
  'valve',
  'select',
  'input_select',
];

export function getDomainEntityOptionsWithPlaceholder(domain) {
  const list = domain === 'homeassistant'
    ? (dummyEntities || [])
    : (dummyEntities || []).filter((e) => e.entity_id.startsWith(`${domain}.`));

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
  const mapped = GROUP_DOMAIN_TO_SERVICE_OPTIONS[domain];
  if (Array.isArray(mapped) && mapped.length) return mapped;
  const fromSpec = getActions(domain);
  if (Array.isArray(fromSpec) && fromSpec.length) return fromSpec;
  return [['-', '']];
}

