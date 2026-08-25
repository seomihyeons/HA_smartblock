import { randomUUID } from 'node:crypto';
import { capabilityForService, isServiceCompatibleWithEntity } from './capability_registry.mjs';

export class ControlNowError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = 'ControlNowError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const text = (value) => String(value ?? '').trim();

function publicCandidate(card) {
  return {
    entity_id: card.entity_id,
    name: card.friendly_name || card.entity_id,
    area: card.area || null,
    domain: card.domain,
  };
}

export function createControlNowService({
  fetchCapabilityContext,
  callService,
  now = () => Date.now(),
  createId = () => randomUUID(),
  ttlMs = 60_000,
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

  async function preview({ service, candidate_entity_ids: candidateIds, selected_entity_id: selectedId } = {}) {
    prune();
    const requestedService = text(service);
    if (!requestedService) throw new ControlNowError('missing_service', 'No grounded service was provided.');

    const { entityCards, registry } = await fetchCapabilityContext();
    const capability = capabilityForService(requestedService, registry);
    if (!capability || capability.available_in_home === false) {
      throw new ControlNowError('unsupported_service', 'The requested service is unavailable in this Home Assistant instance.');
    }
    if (capability.risk !== 'low' || capability.immediate_execution !== 'confirmation_required') {
      throw new ControlNowError('draft_only_service', 'This service is draft-only under the current safety policy.');
    }
    if (!capability.target_required) {
      throw new ControlNowError('targetless_control_not_enabled', 'Immediate execution currently requires a grounded entity target.');
    }

    const allowedIds = new Set((Array.isArray(candidateIds) ? candidateIds : []).map(text).filter(Boolean));
    const compatible = entityCards.filter((card) => (
      (!allowedIds.size || allowedIds.has(card.entity_id))
      && card.supported_actions?.includes(requestedService)
      && isServiceCompatibleWithEntity(requestedService, card.entity_id, registry)
    ));
    if (!compatible.length) {
      throw new ControlNowError('no_compatible_entity', 'No compatible grounded entity is available for this service.');
    }

    const target = selectedId
      ? compatible.find((card) => card.entity_id === text(selectedId))
      : compatible.length === 1 ? compatible[0] : null;
    if (selectedId && !target) {
      throw new ControlNowError('invalid_selection', 'The selected entity is no longer an eligible candidate.');
    }
    if (!target) {
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
      entityId: target.entity_id,
      expiresAt: now() + ttlMs,
      used: false,
    });
    return {
      status: 'ready_to_execute',
      execution_id: executionId,
      expires_in_ms: ttlMs,
      service: requestedService,
      risk: capability.risk,
      entity: publicCandidate(target),
    };
  }

  async function execute({ execution_id: executionId } = {}) {
    const id = text(executionId);
    const item = pending.get(id);
    if (!item || item.used || item.expiresAt <= now()) {
      pending.delete(id);
      throw new ControlNowError('invalid_or_used_preview', 'This preview is invalid, expired, or already used.', 409);
    }
    item.used = true;

    const { entityCards, registry } = await fetchCapabilityContext();
    const capability = capabilityForService(item.service, registry);
    const current = entityCards.find((card) => card.entity_id === item.entityId);
    if (!capability || capability.available_in_home === false
      || capability.risk !== 'low' || capability.immediate_execution !== 'confirmation_required'
      || !current?.supported_actions?.includes(item.service)
      || !isServiceCompatibleWithEntity(item.service, item.entityId, registry)) {
      throw new ControlNowError('capability_revalidation_failed', 'The entity or service is no longer eligible for immediate execution.', 409);
    }

    await callService({ service: item.service, entity_id: item.entityId });
    return { status: 'success', service: item.service, entity: publicCandidate(current) };
  }

  return { preview, execute };
}
