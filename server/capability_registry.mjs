import { DOMAIN_SPEC } from '../src/data/options.js';

export const CAPABILITY_REGISTRY_VERSION = 1;

const HIGH_RISK_SERVICES = new Set([
  'alarm_control_panel.alarm_disarm',
  'alarm_control_panel.alarm_trigger',
  'lock.unlock',
  'valve.open_valve',
]);

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

function text(value) {
  return String(value ?? '').trim();
}

function serviceId(domain, method) {
  return `${domain}.${method}`;
}

function riskForService(service) {
  if (HIGH_RISK_SERVICES.has(service)) return 'high';
  const domain = text(service).split('.')[0];
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
        immediate_execution: riskForService(id) === 'low'
          ? 'confirmation_required'
          : 'draft_only',
      });
    }
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
    services: registry.services
      .filter((service) => service.available_in_home !== false)
      .map((service) => ({
        id: service.id,
        domain: service.domain,
        label: service.label,
        description: service.description,
        fields: Object.fromEntries(Object.entries(service.fields || {}).slice(0, 16).map(([name, field]) => [
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
