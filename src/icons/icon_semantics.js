// Presentation-only icon semantics. Never change Blockly field values or YAML.
// Domain state options and YAML service names remain owned by data/options.js.

export const DOMAIN_ICONS = Object.freeze({
  light: 'lightbulb', switch: 'toggle-switch-variant', lock: 'lock',
  media_player: 'play-circle', climate: 'thermostat', cover: 'curtains',
  binary_sensor: 'radiobox-marked', device_tracker: 'map-marker-account',
  fan: 'fan', camera: 'cctv', sensor: 'gauge', person: 'account',
  input_boolean: 'toggle-switch-variant', ecobee: 'thermostat', input_number: 'numeric',
  input_select: 'form-dropdown', input_text: 'form-textbox',
  automation: 'robot', homeassistant: 'home-automation', backup: 'backup-restore',
  mqtt: 'access-point-network', script: 'script-text', python_script: 'language-python',
  unifi: 'access-point', webostv: 'television', zwave_js: 'z-wave', lifx: 'lightbulb',
  alarm_control_panel: 'shield-home', siren: 'alarm-light', button: 'gesture-tap-button',
  calendar: 'calendar', event: 'tag', group: 'shape',
  humidifier: 'air-humidifier', persistent_notification: 'bell',
  select: 'form-dropdown', vacuum: 'robot-vacuum', valve: 'valve-open',
  weather: 'weather-partly-cloudy', sun: 'weather-sunny',
});

// These are the user's approved filled/outline choices. Do not add icon backgrounds.
export const STATE_ICON_PAIRS = Object.freeze({
  light: { on: ['lightbulb','lightbulb-outline'], off: ['lightbulb-off','lightbulb-off-outline'] },
  switch: { on: ['toggle-switch-variant','toggle-switch-variant'], off: ['toggle-switch-variant-off','toggle-switch-variant-off'] },
  motion: { on: ['motion-sensor','motion-sensor'], off: ['motion-sensor-off','motion-sensor-off'] },
  door: { on: ['door-open','door-open'], off: ['door-closed','door-closed'] },
  person: { home: ['account','account-outline'], not_home: ['account-off','account-off-outline'] },
  cover: { open: ['curtains','curtains'], closed: ['curtains-closed','curtains-closed'] },
  sun: { above_horizon: ['weather-sunny','weather-sunny'], below_horizon: ['weather-night','weather-night'] },
  lock: { locked: ['lock','lock-outline'], unlocked: ['lock-open','lock-open-outline'] },
  device_tracker: { home: ['map-marker-account','map-marker-account-outline'], not_home: ['map-marker-off','map-marker-outline'] },
  binary_sensor: { on: ['radiobox-marked','radiobox-marked'], off: ['radiobox-blank','radiobox-blank'] },
  fan: { on: ['fan','fan'], off: ['fan-off','fan-off'] },
  humidifier: { on: ['air-humidifier','air-humidifier'], off: ['air-humidifier-off','air-humidifier-off'] },
  dehumidifier: { on: ['water-minus','water-minus'], off: ['water-off','water-outline'] },
  siren: { on: ['alarm-light','alarm-light-outline'], off: ['alarm-light-off','alarm-light-off-outline'] },
  valve: { open: ['valve-open','valve-open'], closed: ['valve-closed','valve-closed'] },
  media_player: {
    playing: ['play-circle','play-circle-outline'], paused: ['pause-circle','pause-circle-outline'],
    idle: ['stop-circle','stop-circle-outline'], off: ['stop-circle','stop-circle-outline'],
    stopped: ['stop-circle','stop-circle-outline'],
  },
  climate: { heat: ['fire','thermostat'], cool: ['snowflake','thermostat'], off: ['thermostat','thermostat'] },
  camera: { recording: ['record-circle','record-circle-outline'], idle: ['cctv','cctv'], off: ['cctv','cctv'] },
  alarm_control_panel: {
    disarmed: ['shield-off','shield-outline'], triggered: ['shield-alert','shield-alert-outline'],
    armed_home: ['shield-home','shield-home-outline'], armed_away: ['shield-home','shield-home-outline'],
    armed_night: ['shield-home','shield-home-outline'], armed_vacation: ['shield-home','shield-home-outline'],
  },
  vacuum: {
    cleaning: ['robot-vacuum','robot-vacuum'], docked: ['robot-vacuum-off','robot-vacuum-off'],
    idle: ['robot-vacuum-off','robot-vacuum-off'], error: ['robot-vacuum-alert','robot-vacuum-alert'],
  },
  automation: { on: ['robot','robot-outline'], off: ['robot-off','robot-off-outline'] },
});

const HELPERS = Object.freeze({
  'ha_event_homeassistant': 'home-automation',
  'ha_event_mqtt': 'access-point-network',
  'ha_event_event': 'tag',
  'ha_event_kv': 'code-braces',
  'ha_event_event_data_call_service': 'gesture-tap-button',
  'ha_event_service_data_entity_id': 'home-automation',
  'ha_event_context_kv': 'code-braces',
  'ha_event_mqtt_payload': 'message-text',
  'ha_event_mqtt_value_template': 'code-braces',
  'ha_event_mqtt_encoding': 'code-tags',
  'ha_event_sun': 'weather-sunset-up',
  'ha_event_sun_state': 'weather-sunny',
  'condition_sun': 'weather-sunny',
  'condition_sun_phase': 'weather-night',
  'condition_sun_after': 'weather-sunset-up',
  'condition_sun_before': 'weather-sunset-up',
  'condition_time': 'clock',
  'condition_time_weekly': 'calendar-week',
  'condition_time_after': 'clock',
  'condition_time_before': 'clock',
  'ha_event_time_state': 'clock',
  'ha_event_time_pattern': 'clock',
  'event_sensor_numeric_state': 'gauge',
  'condition_numeric_state_entity': 'gauge',
  'condition_numeric_state_attribute': 'numeric',
  'condition_zone_membership': 'map-marker',
  'condition_logic': 'source-merge',
  'action_notify': 'message-text',
  'action_delay': 'timer',
  'action_if': 'source-branch',
  'action_data_brightness_pct': 'brightness-6',
  'action_data_color': 'palette',
  'action_data_transition': 'timer-sand',
  'action_data_effect': 'auto-fix',
  'action_mqtt_publish': 'access-point-network',
  'action_mqtt_payload_text': 'message-text',
  'action_mqtt_qos': 'gauge',
  'action_mqtt_retain': 'backup-restore',
  'action_mqtt_evaluate_payload': 'code-braces',
  'action_mqtt_data_kv': 'code-braces',
});

function domainForBlockType(type) {
  const t=String(type || '');
  if (t.startsWith('event_binary_sensor_') || t.startsWith('condition_state_binary_sensor')) return 'binary_sensor';
  const trigger=t.match(/^event_(.+)_state$/);
  if (trigger && DOMAIN_ICONS[trigger[1]]) return trigger[1];
  const condition=t.match(/^condition_state_(.+)$/);
  if (condition && DOMAIN_ICONS[condition[1]]) return condition[1];
  const action=t.match(/^action_(.+)$/);
  if (action && DOMAIN_ICONS[action[1]]) return action[1];
  if (t==='ha_event_sun_state' || t==='ha_event_sun') return 'sun';
  return '';
}
export function configuredIconContext(block, entity) {
  const type=String(block?.type || '');
  const get=(key)=>String(block?.getFieldValue?.(key) ?? '').trim().toLowerCase();
  const entityId=get('ENTITY_ID') || get('ENTITY') || get('USER');
  let domain=domainForBlockType(type);
  if (domain==='binary_sensor') {
    const hint=type.includes('_motion') ? 'motion' : type.includes('_door') ? 'door' : '';
    domain=hint || (entity?.attributes?.device_class === 'motion' ? 'motion'
      : entity?.attributes?.device_class === 'door' ? 'door' : 'binary_sensor');
  }
  if (domain==='homeassistant' && entityId?.includes('.')) {
    const targetDomain=entityId.split('.')[0];
    if (DOMAIN_ICONS[targetDomain]) domain=targetDomain;
  }
  // Triggers use the destination state, not FROM. Conditions use STATE.
  let state='';
  if (type.startsWith('action_')) state=get('ACTION') || get('SERVICE');
  else if (type.startsWith('condition_')) state=get('STATE') || get('STATE_KIND') || get('PHASE') || get('EVENT');
  else state=get('TO') || get('EVENT');
  return { type, domain, state, entityId };
}

export function normalizeConfiguredState(domain, rawState) {
  const state=String(rawState || '').toLowerCase();
  const common={turn_on:'on',turn_off:'off',open_cover:'open',close_cover:'closed',
    open_valve:'open',close_valve:'closed',lock:'locked',unlock:'unlocked',
    media_play:'playing',media_pause:'paused',media_stop:'stopped',
    alarm_disarm:'disarmed',alarm_trigger:'triggered',
    alarm_arm_home:'armed_home',alarm_arm_away:'armed_away',
    alarm_arm_night:'armed_night',alarm_arm_vacation:'armed_vacation',
    start:'cleaning',return_to_base:'docked'};
  if (common[state]) return common[state];
  // For sunrise/sunset actions the event describes a boundary, not a day/night state.
  if (state==='sunrise' || state==='sunset' || state==='toggle') return '';
  if (domain==='cover' && (state==='opening' || state==='closing')) return state==='opening' ? 'open' : 'closed';
  if (domain==='media_player' && state==='standby') return 'idle';
  if (domain==='climate' && state==='heating') return 'heat';
  if (domain==='climate' && state==='cooling') return 'cool';
  return state;
}

// All leading and dropdown icons have maximum contrast, including muted flyouts.
export const FILLED_ICON_COLOR = '#000000';

// Structural/group containers and standalone connection modifiers are readable
// without a leading icon. Icons should convey a concrete device, state or event.
const ICONLESS_BLOCKS = new Set([
  'event_action', 'event_condition_action',
  'ha_event_for_hms', 'ha_event_offset', 'condition_sun_offset',
  'condition_not_value',
  'condition_logic', 'condition_not_inline',
  'event_group_entities', 'event_group_numeric_entities',
  'action_if_else', 'action_if_then', 'action_group_entities', 'action_join',
]);

export function resolveConfiguredIcon(block, entity = null) {
  const { type,domain,state }=configuredIconContext(block,entity);
  if (ICONLESS_BLOCKS.has(type)) return null;
  // Value-output helper blocks plug into a neighbor; they do not need
  // standalone leading icons (including future duration/offset variants).
  if (block?.outputConnection && !block?.previousConnection && !block?.nextConnection) return null;
  // Sun event dropdowns describe distinct moments or phases, not one generic sun.
  if (['ha_event_sun','condition_sun_after','condition_sun_before'].includes(type)) {
    return { name: state === 'sunset' ? 'weather-sunset-down' : 'weather-sunset-up', color:FILLED_ICON_COLOR };
  }
  if (type === 'condition_sun_phase') {
    return { name: state === 'sun.is_midnight_sun' ? 'weather-sunny' : 'weather-night', color:FILLED_ICON_COLOR };
  }
  const meaning=normalizeConfiguredState(domain,state);
  const pair=STATE_ICON_PAIRS[domain]?.[meaning];
  if (pair) return { name: pair[0], color:FILLED_ICON_COLOR };
  const helper=HELPERS[type];
  let fallback=helper || DOMAIN_ICONS[domain];
  if (!fallback) {
    if (/^(ha_event_|event_)/.test(type)) fallback=/sun/.test(type)?'weather-sunny':/time/.test(type)?'clock':/mqtt/.test(type)?'access-point-network':'tag';
    else if (type.startsWith('condition_')) fallback=/time/.test(type)?'clock':/numeric/.test(type)?'gauge':/template/.test(type)?'code-braces':'source-merge';
    else if (type.startsWith('action_')) fallback=/mqtt/.test(type)?'access-point-network':/notify/.test(type)?'message-text':/data/.test(type)?'palette':/script/.test(type)?'script-text':'gesture-tap-button';
    else fallback=/raw/.test(type)?'code-tags':/metadata/.test(type)?'information-outline':'puzzle';
  }
  // Undefined or custom states are neutral; never assert 'on' for an unknown service.
  return {name:fallback,color:FILLED_ICON_COLOR};
}

/**
 * Non-entity Sun dropdowns represent configured trigger/condition semantics.
 * They must not be looked up in the Home Assistant entity-state store.
 */
export function resolveSunDropdownIcon(type, fieldName, rawValue) {
  const value=String(rawValue || '').toLowerCase();
  const eventField=['ha_event_sun','condition_sun_after','condition_sun_before'].includes(type)
    && fieldName==='EVENT';
  if (eventField) return {
    name:value==='sunset' ? 'weather-sunset-down' : 'weather-sunset-up',
    color:FILLED_ICON_COLOR,
  };
  if (type==='condition_sun_phase' && fieldName==='PHASE') {
    return {name:value==='sun.is_midnight_sun' ? 'weather-sunny' : 'weather-night',color:FILLED_ICON_COLOR};
  }
  if (type==='ha_event_sun_state' && (fieldName==='FROM' || fieldName==='TO')) {
    return {name:value==='below_horizon' ? 'weather-night' : 'weather-sunny',color:FILLED_ICON_COLOR};
  }
  return null;
}

function unknownActualIcon(domain, entityId) {
  const placeholders={
    light:'lightbulb-outline', switch:'toggle-switch-variant',
    person:'account-outline', device_tracker:'map-marker-outline',
    lock:'lock-outline', alarm_control_panel:'shield-outline',
    automation:'robot-outline', siren:'alarm-light-outline',
    binary_sensor:'radiobox-blank',
  };
  return placeholders[domain] || DOMAIN_ICONS[domain] || 'information-outline';
}

export function resolveActualIcon(entityId, entity) {
  if (!entityId || !entity || entity.entity_id !== entityId) return {name:unknownActualIcon(entityId?.split('.')[0]||'',entityId||''),color:FILLED_ICON_COLOR,unknown:true};
  const domain=String(entity.domain || entityId.split('.')[0]);
  let kind=domain;
  if (domain==='binary_sensor') {
    const dc=String(entity.attributes?.device_class || '').toLowerCase();
    if (dc==='motion' || dc==='door') kind=dc;
  }
  const raw=String(entity.state || '').toLowerCase();
  if (raw==='unknown' || raw==='unavailable' || !raw) return {name:unknownActualIcon(domain,entityId),color:'#69747D',unknown:true};
  const meaning=normalizeConfiguredState(kind,raw);
  const pair=STATE_ICON_PAIRS[kind]?.[meaning];
  return {name:pair?.[1] || DOMAIN_ICONS[domain] || 'information-outline',color:FILLED_ICON_COLOR,unknown:false};
}
