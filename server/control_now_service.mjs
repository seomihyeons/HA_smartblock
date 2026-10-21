import { randomUUID } from 'node:crypto';
import { capabilityForService, isServiceCompatibleWithEntity } from './capability_registry.mjs';
import { selectEntityCards } from './target_selector.mjs';

export class ControlNowError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = 'ControlNowError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const text = (value) => String(value ?? '').trim();

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function validateServiceData(capability, data) {
  const fields = capability.fields || {};
  if (Object.keys(data).some((name) => name === 'entity_id' || !Object.hasOwn(fields, name))) {
    throw new ControlNowError('unsupported_service_data', 'Service data contains an unadvertised field.');
  }
  for (const [name, field] of Object.entries(fields)) {
    const value = data[name];
    if (field?.required && value == null) throw new ControlNowError('missing_service_data', 'Required service data is missing.');
    if (value === undefined) continue;
    const selector = field?.selector || {};
    if (selector.number && (typeof value !== 'number' || !Number.isFinite(value)
      || selector.number.min != null && value < selector.number.min
      || selector.number.max != null && value > selector.number.max)) {
      throw new ControlNowError('invalid_service_data', 'Numeric service data is outside the advertised range.');
    }
    if (selector.boolean && typeof value !== 'boolean') throw new ControlNowError('invalid_service_data', 'Boolean service data is required.');
    if (selector.text && typeof value !== 'string') throw new ControlNowError('invalid_service_data', 'Text service data is required.');
  }
}

// Home Assistant service names carry a portable action verb even when the
// target domain varies.  This is only used to verify observable state after
// a successful API request; it never chooses a service or target.
function expectedStatesForService(service) {
  const method = text(service).split('.')[1] || '';
  return {
    turn_on: ['on'],
    turn_off: ['off'],
    lock: ['locked'],
    unlock: ['unlocked'],
    open: ['open'],
    close: ['closed'],
    open_cover: ['open'],
    close_cover: ['closed'],
    open_valve: ['open'],
    close_valve: ['closed'],
  }[method] || [];
}

function stateByEntity(cards, entityIds) {
  const byId = new Map((Array.isArray(cards) ? cards : []).map((card) => [card.entity_id, card]));
  return entityIds.map((entityId) => ({
    entity_id: entityId,
    state: byId.has(entityId) ? byId.get(entityId).state ?? null : null,
  }));
}

function publicCandidate(card) {
  return {
    entity_id: card.entity_id,
    display_name: card.friendly_name || card.entity_id,
    display_name_source: card.friendly_name ? 'friendly_name' : 'entity_id_fallback',
    area: card.area || null,
    domain: card.domain,
    state: card.state ?? null,
  };
}

export function createControlNowService({
  fetchCapabilityContext,
  callService,
  now = () => Date.now(),
  createId = () => randomUUID(),
  ttlMs = 60_000,
  verificationAttempts = 3,
  verificationIntervalMs = 350,
  wait = sleep,
}) {
  if (typeof fetchCapabilityContext !== 'function' || typeof callService !== 'function') {
    throw new TypeError('Control now requires capability-context and service-call adapters');
  }
  const pending = new Map();

  function prune() {
    const time = now();
    for (const [id, item] of pending) {
      if (item.expiresAt <= time || item.used) pending.delete(id);
    }
  }

  async function preview({ service, target, data = {}, candidate_entity_ids: candidateIds, selected_entity_id: selectedId } = {}) {
    prune();
    const requestedService = text(service);
    if (!requestedService) throw new ControlNowError('missing_service', 'No grounded service was provided.');

    const { entityCards, registry } = await fetchCapabilityContext({ freshServices: true });
    const capability = capabilityForService(requestedService, registry);
    if (!capability || capability.available_in_home === false) {
      throw new ControlNowError('unsupported_service', 'The requested service is unavailable in this Home Assistant instance.');
    }
    if (capability.risk !== 'low' || capability.immediate_execution !== 'confirmation_required') {
      throw new ControlNowError('draft_only_service', 'This service is not enabled for immediate execution.');
    }
    if (!capability.target_required) {
      throw new ControlNowError('targetless_control_not_enabled', 'Immediate execution currently requires a grounded entity target.');
    }
    const requestedData = data && typeof data === 'object' && !Array.isArray(data) ? data : null;
    if (!requestedData) {
      throw new ControlNowError('invalid_service_data', 'Service data must be an object.');
    }
    validateServiceData(capability, requestedData);

    const legacyTarget = Array.isArray(candidateIds) ? {
      selector: 'entity_filter', filter: { entity_ids: candidateIds },
    } : null;
    const selection = selectEntityCards(entityCards, target || legacyTarget);
    if (selection.status === 'invalid') {
      throw new ControlNowError('invalid_target', 'The target selector is invalid.');
    }
    const compatible = selection.cards.filter((card) => (
      card.supported_actions?.includes(requestedService)
      && isServiceCompatibleWithEntity(requestedService, card.entity_id, registry)
    ));
    if (!compatible.length) {
      throw new ControlNowError('no_compatible_entity', 'No compatible grounded entity is available for this service.');
    }

    const selectedTarget = selectedId
      ? compatible.find((card) => card.entity_id === text(selectedId))
      : compatible.length === 1 ? compatible[0] : null;
    if (selectedId && !selectedTarget) {
      throw new ControlNowError('invalid_selection', 'The selected entity is no longer an eligible candidate.');
    }
    // A collection selector is explicit: executing every compatible target is
    // its semantic meaning, not an ambiguity requiring a per-entity click.
    const explicitCollection = Boolean(target) && text(target?.selector) === 'entity_filter';
    const targets = explicitCollection ? compatible : selectedTarget ? [selectedTarget] : [];
    if (!targets.length) {
      return {
        status: 'needs_confirmation',
        question: 'Which Home Assistant entity should be controlled?',
        service: requestedService,
        candidates: compatible.slice(0, 8).map(publicCandidate),
      };
    }

    const executionId = createId();
    pending.set(executionId, {
      service: requestedService,
      entityIds: targets.map((card) => card.entity_id),
      statesBefore: stateByEntity(entityCards, targets.map((card) => card.entity_id)),
      data: structuredClone(requestedData),
      expiresAt: now() + ttlMs,
      used: false,
    });
    return {
      status: 'ready_to_execute',
      execution_id: executionId,
      expires_in_ms: ttlMs,
      service: requestedService,
      risk: capability.risk,
      data: structuredClone(requestedData),
      entity: targets.length === 1 ? publicCandidate(targets[0]) : null,
      entities: targets.map(publicCandidate),
      target_count: targets.length,
    };
  }

  async function execute({ execution_id: executionId, confirmed = false } = {}) {
    if (confirmed !== true) throw new ControlNowError('confirmation_required', 'Press Execute to confirm this exact preview.', 409);
    const id = text(executionId);
    const item = pending.get(id);
    if (!item || item.used || item.expiresAt <= now()) {
      pending.delete(id);
      throw new ControlNowError('invalid_or_used_preview', 'This preview is invalid, expired, or already used.', 409);
    }
    item.used = true;

    const { entityCards, registry } = await fetchCapabilityContext({ freshServices: true });
    const capability = capabilityForService(item.service, registry);
    const current = item.entityIds.map((entityId) => entityCards.find((card) => card.entity_id === entityId));
    if (!capability || capability.available_in_home === false
      || capability.risk !== 'low' || capability.immediate_execution !== 'confirmation_required'
      || current.some((card) => !card?.supported_actions?.includes(item.service)
        || !isServiceCompatibleWithEntity(item.service, card.entity_id, registry))) {
      throw new ControlNowError('capability_revalidation_failed', 'The entity or service is no longer eligible for immediate execution.', 409);
    }

    validateServiceData(capability, item.data);
    const request = {
      service: item.service,
      entity_id: item.entityIds.length === 1 ? item.entityIds[0] : item.entityIds,
    };
    if (Object.keys(item.data).length) request.data = item.data;
    await callService(request);

    const expectedStates = expectedStatesForService(item.service);
    let observed = stateByEntity(current, item.entityIds);
    let verified = false;
    const attempts = Math.max(1, Number.parseInt(String(verificationAttempts), 10) || 1);
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) await wait(Math.max(0, Number(verificationIntervalMs) || 0));
      const latest = await fetchCapabilityContext({ freshServices: true });
      observed = stateByEntity(latest.entityCards, item.entityIds);
      verified = expectedStates.length && !Object.keys(item.data).length
        ? observed.every((entry) => expectedStates.includes(text(entry.state).toLowerCase()))
        : false;
      if (verified) break;
    }
    return {
      status: 'accepted', service: item.service,
      request_status: 'accepted',
      entity: current.length === 1 ? publicCandidate(current[0]) : null,
      entities: current.map(publicCandidate), target_count: current.length,
      verification: {
        status: verified ? 'confirmed' : 'not_confirmed',
        expected_states: expectedStates,
        before: item.statesBefore,
        observed,
      },
    };
  }

  return { preview, execute };
}
