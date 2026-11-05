// Live Home Assistant states -> privacy-bounded Entity Cards for LLM grounding.
import { createCapabilityRegistry, servicesForEntityDomain } from './capability_registry.mjs';

function text(value) {
  return String(value ?? '').trim();
}

function uniqueStrings(values) {
  return [...new Set((values || []).map(text).filter(Boolean))];
}

const SAFE_CAPABILITY_ATTRIBUTES = [
  'supported_color_modes',
  'hvac_modes',
  'preset_modes',
  'fan_modes',
  'percentage_step',
  'min_temp',
  'max_temp',
  'min_humidity',
  'max_humidity',
  'options',
  'unit_of_measurement',
  // These are a media entity's currently advertised selectable content, not
  // a user-specific alias table. They let a planner reuse a live virtual
  // alarm/media capability instead of fabricating an opaque content ID.
  'media_content_id',
  'media_content_type',
];

export function buildEntityCards(states, options = {}) {
  if (!Array.isArray(states)) return [];
  const registry = options.registry || createCapabilityRegistry();

  return states.flatMap((state) => {
    if (!state || typeof state !== 'object') return [];
    const entityId = text(state.entity_id);
    if (!entityId.includes('.')) return [];
    const attributes = state.attributes && typeof state.attributes === 'object'
      ? state.attributes
      : {};
    const domain = entityId.split('.', 1)[0];

    const capabilityAttributes = Object.fromEntries(
      SAFE_CAPABILITY_ATTRIBUTES
        .filter((key) => attributes[key] != null)
        .map((key) => [key, attributes[key]]),
    );

    return [{
      entity_id: entityId,
      friendly_name: text(attributes.friendly_name) || entityId,
      domain,
      state: state.state ?? null,
      device_class: text(attributes.device_class) || null,
      area: text(state.area || attributes.area) || null,
      capabilities: uniqueStrings([
        ...(Array.isArray(attributes.supported_color_modes)
          ? attributes.supported_color_modes
          : []),
      ]),
      capability_attributes: capabilityAttributes,
      supported_actions: servicesForEntityDomain(domain, registry),
    }];
  });
}
