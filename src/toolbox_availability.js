const ENTITY_BOUND_ACTION_DOMAINS = new Set([
  'light', 'switch', 'lock', 'media_player', 'climate', 'cover', 'fan',
  'input_boolean', 'input_number', 'input_select', 'input_text', 'automation',
  'alarm_control_panel', 'siren', 'button', 'calendar', 'event', 'group',
  'humidifier', 'persistent_notification', 'select', 'vacuum', 'valve',
]);

const DOMAIN_LABELS = {
  alarm_control_panel: 'Alarm Control Panel',
  binary_sensor: 'Binary Sensor',
  device_tracker: 'Device Tracker',
  input_boolean: 'Input Boolean',
  input_number: 'Input Number',
  input_select: 'Input Select',
  input_text: 'Input Text',
  media_player: 'Media Player',
  persistent_notification: 'Persistent Notification',
  python_script: 'Python Script',
  zwave_js: 'Z-Wave JS',
};

const SPECIAL_LABELS = {
  event_action: 'Event Action',
  event_condition_action: 'Event Condition Action',
  event_sensor_numeric_state: 'Sensor Numeric State',
  condition_numeric_state_entity: 'Numeric State',
  condition_numeric_state_attribute: 'Numeric Attribute',
  condition_zone_membership: 'Zone Membership',
  action_ecobee_service: 'Ecobee Service',
  action_script_call: 'Script Call',
  action_script_target_entity: 'Script Target Entity',
  action_notify: 'Notify',
};

function titleCase(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function domainLabel(domain) {
  return DOMAIN_LABELS[domain] || titleCase(domain);
}

function stateDomainForType(type) {
  if (type === 'event_sensor_numeric_state') return '';
  const match = /^(?:event_(.+)_state|condition_state_(.+))$/.exec(type);
  return match?.[1] || match?.[2] || '';
}

function actionDomainForType(type) {
  const match = /^action_(.+)$/.exec(type);
  const domain = match?.[1] || '';
  return ENTITY_BOUND_ACTION_DOMAINS.has(domain) ? domain : '';
}

function normalizeEntities(entities) {
  return Array.isArray(entities)
    ? entities.filter((entity) => String(entity?.entity_id || '').includes('.'))
    : [];
}

export function getRuntimeCapabilities(entities) {
  const rows = normalizeEntities(entities);
  const entityIds = new Set(rows.map((entity) => String(entity.entity_id)));
  const domains = new Set(rows.map((entity) => String(entity.entity_id).split('.', 1)[0]));
  const numericState = rows.some((entity) => !Number.isNaN(Number.parseFloat(entity?.state)));
  const numericAttribute = rows.some((entity) =>
    Object.values(entity?.attributes || {}).some((value) => !Number.isNaN(Number.parseFloat(value)))
  );

  return {
    domains,
    entityIds,
    numericState,
    numericAttribute,
    hasActionTarget: [...ENTITY_BOUND_ACTION_DOMAINS].some((domain) => domains.has(domain)),
    hasStateTarget: domains.size > 0,
  };
}

/**
 * Returns whether a toolbox block has a matching target in the currently
 * connected Home Assistant instance. Generic blocks remain available because
 * they do not require an entity selector to be useful.
 */
export function isToolboxBlockAvailable(type, entities) {
  const capabilities = getRuntimeCapabilities(entities);
  const stateDomain = stateDomainForType(type);
  if (stateDomain) return capabilities.domains.has(stateDomain);

  const actionDomain = actionDomainForType(type);
  if (actionDomain) return capabilities.domains.has(actionDomain);

  switch (type) {
    case 'event_sensor_numeric_state':
    case 'condition_numeric_state_entity':
      return capabilities.numericState;
    case 'condition_numeric_state_attribute':
      return capabilities.numericAttribute;
    case 'condition_zone_membership':
      return capabilities.entityIds.has('zone.home');
    case 'action_ecobee_service':
      return capabilities.domains.has('climate');
    case 'action_script_call':
    case 'action_script_target_entity':
      return capabilities.domains.has('script');
    case 'action_notify':
      return capabilities.entityIds.has('notify.test_user');
    case 'event_group_entities':
    case 'event_group_numeric_entities':
    case 'event_group_entity_item':
      return capabilities.hasStateTarget;
    case 'action_group_entities':
    case 'action_group_entity_item':
      return capabilities.hasActionTarget;
    default:
      return true;
  }
}

/**
 * Stable English sort key for toolbox blocks. Domain blocks use the visible
 * domain name; the fallback keeps auxiliary blocks predictable without
 * changing their Blockly type or generated YAML.
 */
export function getToolboxBlockSortLabel(type) {
  if (SPECIAL_LABELS[type]) return SPECIAL_LABELS[type];

  const stateDomain = stateDomainForType(type);
  if (stateDomain) return domainLabel(stateDomain);

  const actionDomain = actionDomainForType(type);
  if (actionDomain) return domainLabel(actionDomain);

  return titleCase(
    String(type || '')
      .replace(/^(?:ha_)?event_/, '')
      .replace(/^condition_/, '')
      .replace(/^action_/, '')
  );
}
