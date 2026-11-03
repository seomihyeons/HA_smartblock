// Presentation-only icon semantics. Never change Blockly field values or YAML.
// Domain state options and YAML service names remain owned by data/options.js.

export const DOMAIN_ICONS = Object.freeze({
  light: 'lightbulb', switch: 'toggle-switch', lock: 'lock',
  media_player: 'play-circle', climate: 'thermostat', cover: 'curtains',
  binary_sensor: 'radiobox-marked', device_tracker: 'map-marker-account',
  fan: 'fan', camera: 'cctv', sensor: 'gauge', person: 'account',
  input_boolean: 'toggle-switch', ecobee: 'thermostat', input_number: 'numeric',
  input_select: 'form-dropdown', input_text: 'form-textbox',
  automation: 'robot', homeassistant: 'home-automation', backup: 'backup-restore',
  mqtt: 'access-point-network', script: 'script-text', python_script: 'language-python',
  unifi: 'access-point', webostv: 'television', zwave_js: 'z-wave', lifx: 'lightbulb',
  alarm_control_panel: 'shield-home', siren: 'alarm-light', button: 'gesture-tap-button',
  calendar: 'calendar', event: 'lightning-bolt', group: 'shape',
  humidifier: 'air-humidifier', persistent_notification: 'bell',
  select: 'form-dropdown', vacuum: 'robot-vacuum', valve: 'valve-open',
  weather: 'weather-partly-cloudy', sun: 'weather-sunny',
});

// These are the user's approved filled/outline choices. Do not add icon backgrounds.
export const STATE_ICON_PAIRS = Object.freeze({
  light: { on: ['lightbulb-on','lightbulb-on-outline'], off: ['lightbulb-off','lightbulb-outline'] },
  switch: { on: ['toggle-switch','toggle-switch-outline'], off: ['toggle-switch-off','toggle-switch-off-outline'] },
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
  'ha_event_event': 'lightning-bolt',
  'ha_event_sun': 'weather-sunset',
  'ha_event_sun_state': 'weather-sunny',
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
  if (domain==='switch' && entityId==='switch.dehumidifier') domain='dehumidifier';
  if (domain==='homeassistant' && entityId?.includes('.')) {
    const targetDomain=entityId.split('.')[0];
    if (DOMAIN_ICONS[targetDomain]) domain=targetDomain;
  }
  // Triggers use the destination state, not FROM. Conditions use STATE.
  let state='';
  if (type.startsWith('action_')) state=get('ACTION') || get('SERVICE');
  else if (type.startsWith('condition_')) state=get('STATE') || get('STATE_KIND');
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

function semanticColor(domain,state) {
  if (!state) return '#355469';
  if (['off','not_home','closed','idle','docked','stopped','disarmed','paused'].includes(state)) return '#59656F';
  if (state==='unlocked') return '#A46113';
  if (domain==='light' || domain==='sun') return '#916200';
  if (domain==='door' || domain==='siren' || state==='triggered' || state==='error') return '#9F4F15';
  if (domain==='person' || domain==='device_tracker' || domain==='lock') return '#166D45';
  return '#16578A';
}

export function resolveConfiguredIcon(block, entity = null) {
  const { type,domain,state }=configuredIconContext(block,entity);
  // Rule containers already carry colored Trigger/Condition/Action labels.
  if (type==='event_action' || type==='event_condition_action') return null;
  const meaning=normalizeConfiguredState(domain,state);
  const pair=STATE_ICON_PAIRS[domain]?.[meaning];
  if (pair) return { name: pair[0], color:semanticColor(domain,meaning) };
  const helper=HELPERS[type];
  let fallback=helper || DOMAIN_ICONS[domain];
  if (!fallback) {
    if (/^(ha_event_|event_)/.test(type)) fallback=/sun/.test(type)?'weather-sunny':/time/.test(type)?'clock':/mqtt/.test(type)?'access-point-network':'lightning-bolt';
    else if (type.startsWith('condition_')) fallback=/time/.test(type)?'clock':/numeric/.test(type)?'gauge':/template/.test(type)?'code-braces':'source-merge';
    else if (type.startsWith('action_')) fallback=/mqtt/.test(type)?'access-point-network':/notify/.test(type)?'message-text':/data/.test(type)?'palette':/script/.test(type)?'script-text':'gesture-tap-button';
    else fallback=/raw/.test(type)?'code-tags':/metadata/.test(type)?'information-outline':'puzzle';
  }
  // Undefined or custom states are neutral; never assert 'on' for an unknown service.
  return {name:fallback,color:'#355469'};
}

export function resolveActualIcon(entityId, entity) {
  if (!entityId || !entity || entity.entity_id !== entityId) return {name:'information-outline',color:'#69747D',unknown:true};
  const domain=String(entity.domain || entityId.split('.')[0]);
  let kind=domain;
  if (domain==='binary_sensor') {
    const dc=String(entity.attributes?.device_class || '').toLowerCase();
    if (dc==='motion' || dc==='door') kind=dc;
  }
  if (entityId==='switch.dehumidifier') kind='dehumidifier';
  const raw=String(entity.state || '').toLowerCase();
  if (raw==='unknown' || raw==='unavailable' || !raw) return {name:DOMAIN_ICONS[domain] || 'information-outline',color:'#69747D',unknown:true};
  const meaning=normalizeConfiguredState(kind,raw);
  const pair=STATE_ICON_PAIRS[kind]?.[meaning];
  return {name:pair?.[1] || DOMAIN_ICONS[domain] || 'information-outline',color:'#62727D',unknown:false};
}
