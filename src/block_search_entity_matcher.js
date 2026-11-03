import { dummyEntities } from './data/entities_index.js';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function tokens(value) {
  return normalize(value).match(/[a-z0-9]+/g) || [];
}

function domainOf(entity) {
  return String(entity?.entity_id || '').split('.', 1)[0];
}

function targetDomain(type) {
  if (/^(event_|condition_state_)/.test(type)) {
    return type.replace(/^event_|^condition_state_/, '').replace(/_state$/, '');
  }
  if (type === 'condition_numeric_state_entity' || type === 'event_sensor_numeric_state') return 'sensor';
  if (type === 'condition_numeric_state_attribute') return '';
  const action = /^action_(.+)$/.exec(type)?.[1] || '';
  return action === 'ecobee' ? 'climate' : action;
}

function supportsEntityField(type) {
  return /^(event_|condition_|action_)/.test(type) && ![
    'action_if', 'action_delay', 'action_data', 'action_mqtt', 'action_notify',
  ].includes(type);
}

// Bind only unambiguous selector blocks. A search result never changes a
// container's meaning merely because its text happened to match an entity.
export function selectSearchEntity(type, query, entities = dummyEntities) {
  if (!supportsEntityField(type) || tokens(query).join('').length < 3) return null;
  const domain = targetDomain(type);
  const queryTokens = tokens(query);
  const candidates = (entities || []).filter((entity) => {
    if (!entity?.entity_id || (domain && domainOf(entity) !== domain)) return false;
    const text = normalize([
      entity.entity_id, entity.name, entity.friendly_name, entity.attributes?.friendly_name,
    ].filter(Boolean).join(' '));
    return queryTokens.every((token) => text.includes(token));
  }).sort((left, right) => String(left.entity_id).localeCompare(String(right.entity_id)));
  return candidates[0] ? { field: 'ENTITY_ID', entityId: String(candidates[0].entity_id) } : null;
}
