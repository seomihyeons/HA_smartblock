import { runtimeNotifyServices } from './data/entities_index.js';
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
};

const SPECIAL_LABELS = {
  event_action: 'Event Action', event_condition_action: 'Event Condition Action',
  event_sensor_numeric_state: 'Sensor Numeric State',
  condition_numeric_state_entity: 'Numeric State',
  condition_numeric_state_attribute: 'Numeric Attribute',
  condition_zone_membership: 'Zone Membership', action_ecobee_service: 'Ecobee Service',
  action_script_call: 'Script Call', action_script_target_entity: 'Script Target Entity',
  action_notify: 'Notify',
};

function titleCase(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeEntities(entities) {
  return Array.isArray(entities)
    ? entities.filter((entity) => String(entity?.entity_id || '').includes('.'))
    : [];
}

function stateTargetForType(type) {
  if (type === 'event_sensor_numeric_state') return '';
  const match = /^(?:event_(.+)_state|condition_state_(.+))$/.exec(type);
  const domain = match?.[1] || match?.[2] || '';
  return domain ? { domain } : null;
}

function actionDomainForType(type) {
  const match = /^action_(.+)$/.exec(type);
  const domain = match?.[1] || '';
  return ENTITY_BOUND_ACTION_DOMAINS.has(domain) ? domain : '';
}

export function getRuntimeCapabilities(entities) {
  const rows = normalizeEntities(entities);
  const domains = new Set(rows.map((entity) => String(entity.entity_id).split('.', 1)[0]));
  return {
    entityIds: new Set(rows.map((entity) => String(entity.entity_id))),
    domains,
    numericState: rows.some((entity) => Number.isFinite(Number.parseFloat(entity?.state))),
    numericAttribute: rows.some((entity) => Object.values(entity?.attributes || {})
      .some((value) => Number.isFinite(Number.parseFloat(value)))),
    hasStateTarget: domains.size > 0,
    hasActionTarget: [...ENTITY_BOUND_ACTION_DOMAINS].some((domain) => domains.has(domain)),
  };
}

/** Generic blocks remain enabled; entity-bound blocks are merely dimmed. */
export function isToolboxBlockAvailable(type, entities) {
  const capabilities = getRuntimeCapabilities(entities);
  const stateTarget = stateTargetForType(type);
  if (stateTarget) return capabilities.domains.has(stateTarget.domain);

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
      return capabilities.domains.has('notify') || runtimeNotifyServices.length > 0;
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

export function getToolboxBlockSortLabel(type) {
  if (SPECIAL_LABELS[type]) return SPECIAL_LABELS[type];
  const stateTarget = stateTargetForType(type);
  if (stateTarget) return DOMAIN_LABELS[stateTarget.domain] || titleCase(stateTarget.domain);
  const actionDomain = actionDomainForType(type);
  if (actionDomain) return DOMAIN_LABELS[actionDomain] || titleCase(actionDomain);
  return titleCase(String(type || '').replace(/^(?:ha_)?event_/, '').replace(/^condition_/, '').replace(/^action_/, ''));
}
