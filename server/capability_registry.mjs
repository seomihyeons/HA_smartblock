import { DOMAIN_SPEC } from '../src/data/options.js';

export const CAPABILITY_REGISTRY_VERSION = 2;

// Host-level operations are deliberately few and composable.  They are not
// per-utterance rules: live EntityCards and services determine what each one
// can do in a particular Home Assistant instance.
export const AGENT_OPERATIONS = Object.freeze([
  // The planner can explicitly request a selected Blockly/HA automation
  // context instead of guessing a replacement from an ambiguous reference.
  { id: 'automation_context_required', intents: ['automation'], selectors: [] },
  { id: 'entity_identity', intents: ['information'], selectors: ['entity'] },
  {
    id: 'entity_property',
    intents: ['information'],
    selectors: ['entity', 'entity_filter'],
    properties: ['state', 'capability_attributes'],
  },
  {
    id: 'entity_collection',
    intents: ['information'],
    selectors: ['entity', 'entity_filter'],
    projections: ['display_name', 'entity_id', 'domain', 'area', 'state', 'capability_attributes'],
    aggregations: ['count'],
  },
  { id: 'service_collection', intents: ['information'], selectors: [] },
  { id: 'service_capability', intents: ['information'], selectors: ['entity'] },
  {
    id: 'service_control',
    intents: ['control'],
    selectors: ['entity', 'entity_filter'],
  },
  { id: 'automation_generation', intents: ['automation'] },
  { id: 'goal_plan', intents: ['routine'] },
]);

const HIGH_RISK_SERVICES = new Set([
  'alarm_control_panel.alarm_disarm',
  'alarm_control_panel.alarm_trigger',
  'lock.unlock',
  'valve.open_valve',
]);

// This is a service-semantics policy, not a per-device or per-language rule.
// A generic on/off/toggle action is normally reversible.  The explicitly
// listed high-risk services above always win; configuration-oriented services
// such as climate.set_temperature remain medium risk through their domain.
const REVERSIBLE_SERVICE_METHODS = new Set(['turn_on', 'turn_off', 'toggle']);

const MEDIUM_RISK_DOMAINS = new Set([
  'alarm_control_panel',
  'automation',
  'climate',
  'cover',
  'fan',
  'humidifier',
  'lock',
  'media_player',
  'script',
  'python_script',
  'vacuum',
  'valve',
]);

const TARGET_OPTIONAL_DOMAINS = new Set([
  'backup',
  'homeassistant',
  'mqtt',
  'persistent_notification',
  'python_script',
]);

// These domains have dedicated Blockly import/export adapters even though
// they are not ordinary entity-domain action dropdowns. Their concrete
// services remain live-HA metadata, never a fixed per-home service list.
const RUNTIME_VISUAL_SERVICE_DOMAINS = new Set(['notify']);

export const VISUAL_TRIGGER_KINDS = Object.freeze([
  'state',
  'numeric_state',
  'time',
  'time_pattern',
  'sun',
  'homeassistant',
  'event',
  'mqtt',
  'template',
]);

export const VISUAL_CONDITION_KINDS = Object.freeze([
  'state',
  'numeric_state',
  'time',
  'sun',
  'template',
  'and',
  'or',
  'not',
]);

export const VISUAL_ACTION_STRUCTURES = Object.freeze([
  'service',
  'delay',
  'choose',
]);

// This is intentionally expressed as Home Assistant YAML semantics, not as
// Blockly's private USE_ABOVE/USE_BELOW implementation fields.  The same
// contract can therefore drive an LLM, YAML validation, and a visual editor.
export const NUMERIC_STATE_DIALECT = Object.freeze({
  trigger: 'numeric_state',
  condition: 'numeric_state',
  fields: Object.freeze(['entity_id', 'attribute', 'above', 'below', 'for']),
  modes: Object.freeze({
    above: Object.freeze({ required_fields: Object.freeze(['above']), forbidden_fields: Object.freeze(['below']) }),
    below: Object.freeze({ required_fields: Object.freeze(['below']), forbidden_fields: Object.freeze(['above']) }),
    between: Object.freeze({ required_fields: Object.freeze(['above', 'below']), constraint: 'above < below' }),
  }),
  numeric_values: Object.freeze({ allow_zero: true, allow_negative: true, allow_decimal: true }),
});

function text(value) {
  return String(value ?? '').trim();
}

function serviceId(domain, method) {
  return `${domain}.${method}`;
}

function riskForService(service) {
  if (HIGH_RISK_SERVICES.has(service)) return 'high';
  const [domain, method] = text(service).split('.');
  if (REVERSIBLE_SERVICE_METHODS.has(method) && domain !== 'lock' && domain !== 'valve') return 'low';
  return MEDIUM_RISK_DOMAINS.has(domain) ? 'medium' : 'low';
}

function normalizeHaServices(serviceCatalog = []) {
  const byId = new Map();
  for (const domainEntry of Array.isArray(serviceCatalog) ? serviceCatalog : []) {
    const domain = text(domainEntry?.domain);
    const services = domainEntry?.services && typeof domainEntry.services === 'object'
      ? domainEntry.services
      : {};
    for (const [method, metadata] of Object.entries(services)) {
      if (!domain || !method) continue;
      byId.set(serviceId(domain, method), {
        name: text(metadata?.name) || method,
        description: text(metadata?.description),
        fields: metadata?.fields && typeof metadata.fields === 'object' ? metadata.fields : {},
        target: metadata?.target && typeof metadata.target === 'object' ? metadata.target : {},
      });
    }
  }
  return byId;
}

function flattenedServiceFields(fields = {}) {
  const result = {};
  for (const [name, field] of Object.entries(fields || {})) {
    if (name === 'additional_fields' && field?.fields && typeof field.fields === 'object') {
      Object.assign(result, flattenedServiceFields(field.fields));
    } else {
      result[name] = field;
    }
  }
  return result;
}

/** A read-only description of every service actually advertised by this HA. */
export function publicInformationServices(serviceCatalog = []) {
  return [...normalizeHaServices(serviceCatalog).entries()]
    .map(([id, metadata]) => ({
      id,
      domain: id.split('.', 1)[0],
      label: metadata.name,
      description: metadata.description,
      fields: Object.fromEntries(Object.entries(flattenedServiceFields(metadata.fields)).slice(0, 32).map(([name, field]) => [
        name,
        {
          required: field?.required === true,
          description: text(field?.description),
          example: field?.example ?? null,
          selector: text(Object.keys(field?.selector || {})[0]) || null,
        },
      ])),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function createCapabilityRegistry({ serviceCatalog = [] } = {}) {
  const liveServices = normalizeHaServices(serviceCatalog);
  const hasLiveCatalog = liveServices.size > 0;
  const services = [];

  for (const [domain, spec] of Object.entries(DOMAIN_SPEC)) {
    for (const option of Array.isArray(spec?.actions) ? spec.actions : []) {
      const [label, method] = option;
      const id = serviceId(domain, method);
      const live = liveServices.get(id);
      services.push({
        id,
        domain,
        method,
        label: text(live?.name) || text(label) || method,
        description: text(live?.description),
        fields: live?.fields || {},
        target: live?.target || {},
        target_required: !TARGET_OPTIONAL_DOMAINS.has(domain),
        visual_support: 'native',
        available_in_home: hasLiveCatalog ? liveServices.has(id) : null,
        risk: riskForService(id),
        // Risk remains observable metadata for later policy work, but it does
        // not block the research/test control path.  The live service catalog,
        // target compatibility, and service-field validation remain enforced.
        immediate_execution: 'confirmation_required',
      });
    }
  }

  // Notify services use a dedicated Blockly action mapper. Include only the
  // endpoints advertised by this running HA instance so automation planning
  // can use notifications without inventing a private/mobile-app service.
  for (const [id, live] of liveServices) {
    const [domain, method] = id.split('.', 2);
    if (!RUNTIME_VISUAL_SERVICE_DOMAINS.has(domain) || services.some((service) => service.id === id)) continue;
    services.push({
      id,
      domain,
      method,
      label: text(live.name) || method,
      description: text(live.description),
      fields: live.fields || {},
      target: live.target || {},
      // A notify entity target is required by notify.send_message even when
      // service metadata omits the target descriptor.
      target_required: id === 'notify.send_message' || Object.keys(live.target || {}).length > 0,
      visual_support: 'native',
      available_in_home: true,
      risk: riskForService(id),
      immediate_execution: 'confirmation_required',
    });
  }

  const serviceMap = new Map(services.map((service) => [service.id, service]));
  return {
    version: CAPABILITY_REGISTRY_VERSION,
    services,
    serviceMap,
    triggerKinds: [...VISUAL_TRIGGER_KINDS],
    conditionKinds: [...VISUAL_CONDITION_KINDS],
    actionStructures: [...VISUAL_ACTION_STRUCTURES],
    hasLiveCatalog,
  };
}

export function servicesForEntityDomain(domain, registry = createCapabilityRegistry()) {
  return registry.services
    .filter((service) => service.domain === domain)
    .filter((service) => domain !== 'notify' || service.id === 'notify.send_message')
    .filter((service) => service.available_in_home !== false)
    .map((service) => service.id);
}

export function capabilityForService(service, registry = createCapabilityRegistry()) {
  return registry.serviceMap.get(text(service)) || null;
}

export function isServiceCompatibleWithEntity(service, entityId, registry = createCapabilityRegistry()) {
  const capability = capabilityForService(service, registry);
  const domain = text(entityId).split('.')[0];
  if (!capability || !domain) return false;
  if (capability.domain === 'homeassistant') return true;
  return capability.domain === domain;
}

export function publicCapabilityContext(registry) {
  return {
    registry_version: registry.version,
    trigger_kinds: registry.triggerKinds,
    condition_kinds: registry.conditionKinds,
    action_structures: registry.actionStructures,
    numeric_state: NUMERIC_STATE_DIALECT,
    operations: AGENT_OPERATIONS,
    services: registry.services
      .filter((service) => service.available_in_home !== false)
      .map((service) => ({
        id: service.id,
        domain: service.domain,
        label: service.label,
        description: service.description,
        fields: Object.fromEntries(Object.entries(flattenedServiceFields(service.fields)).slice(0, 24).map(([name, field]) => [
          name,
          {
            required: field?.required === true,
            example: field?.example ?? null,
            selector: text(Object.keys(field?.selector || {})[0]) || null,
          },
        ])),
        target_required: service.target_required,
        risk: service.risk,
        visual_support: service.visual_support,
      })),
  };
}

export function scopeCapabilityContext(context, cards = []) {
  const serviceIds = new Set((Array.isArray(cards) ? cards : [])
    .flatMap((card) => card?.supported_actions || [])
    .map(text)
    .filter(Boolean));
  return {
    ...context,
    services: (Array.isArray(context?.services) ? context.services : []).filter((service) => (
      serviceIds.has(text(typeof service === 'string' ? service : service?.id))
      || service?.target_required === false
    )),
  };
}
