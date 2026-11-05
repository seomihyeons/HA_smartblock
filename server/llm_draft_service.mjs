// Deterministic visual draft validator and fake fixture, retained for offline tests.
// Production planning uses provider_neutral_assistant_adapter.mjs.
export { buildEntityCards } from './entity_cards.mjs';
import { validateAutomationIr } from '../src/automation_ir/schema.mjs';
import { capabilityForService, createCapabilityRegistry, isServiceCompatibleWithEntity } from './capability_registry.mjs';

const TURN_ON_RE = /(켜|켜줘|turn\s+on|switch\s+on)/i;
const MOTION_RE = /(움직임|움직|모션|motion|movement|presence)/i;

function text(value) {
  return String(value ?? '').trim();
}

function normalized(value) {
  return text(value)
    .toLocaleLowerCase()
    .replace(/[_\-.()/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function candidateText(card) {
  return normalized([
    card.entity_id,
    card.friendly_name,
    card.area,
    card.domain,
    card.device_class,
  ].filter(Boolean).join(' '));
}

function scoreCandidate(command, card, role) {
  const commandText = normalized(command);
  const haystack = candidateText(card);
  const entityTail = normalized(text(card.entity_id).split('.').slice(1).join(' '));
  const friendlyName = normalized(card.friendly_name);
  let score = 0;

  if (friendlyName && commandText.includes(friendlyName)) score += 10;
  if (entityTail && commandText.includes(entityTail)) score += 8;

  const commandTokens = new Set(commandText.split(' ').filter((token) => token.length > 1));
  for (const token of commandTokens) {
    if (haystack.includes(token)) score += 2;
  }

  if (role === 'trigger' && MOTION_RE.test(commandText)) {
    if (card.domain === 'binary_sensor') score += 3;
    if (normalized(card.device_class) === 'motion') score += 8;
    if (/(motion|pir|움직|모션)/i.test(haystack)) score += 5;
  }

  if (role === 'action' && TURN_ON_RE.test(commandText)) {
    if (card.domain === 'light') score += 5;
    if (/(light|lamp|조명|램프|무드)/i.test(haystack)) score += 4;
  }

  return score;
}

function rankedCandidates(command, cards, predicate, role) {
  return cards
    .filter(predicate)
    .map((card) => ({ card, score: scoreCandidate(command, card, role) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.card.entity_id.localeCompare(b.card.entity_id));
}

function resolveCandidate(command, candidates, selectedEntityId) {
  if (selectedEntityId) {
    return candidates.find(({ card }) => card.entity_id === selectedEntityId)?.card || null;
  }
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0].card;
  if (candidates[0].score > candidates[1].score) return candidates[0].card;
  return undefined;
}

function confirmation(role, candidates) {
  const label = role === 'trigger' ? 'motion sensor' : 'light';
  return {
    status: 'needs_confirmation',
    role,
    question: `Which ${label} did you mean?`,
    candidates: candidates.slice(0, 8).map(({ card, score }) => ({
      entity_id: card.entity_id,
      name: card.friendly_name || card.entity_id,
      area: card.area || null,
      score,
    })),
  };
}

export function validateDraft(automation, cards, options = {}) {
  const schemaValidation = validateAutomationIr(automation);
  const errors = [...schemaValidation.errors];
  const availableCards = Array.isArray(cards) ? cards : [];
  const entityIds = new Set(availableCards.map((card) => card.entity_id));
  const triggers = Array.isArray(automation?.triggers) ? automation.triggers : [];
  const actions = Array.isArray(automation?.actions) ? automation.actions : [];
  const allowManualTrigger = options.allow_manual_trigger === true;
  const registry = options.registry || createCapabilityRegistry();

  if (triggers.length > 4 || (triggers.length === 0 && !allowManualTrigger)) {
    errors.push('A visual draft requires one to four triggers, or no trigger for an explicitly manual draft.');
  }
  if (actions.length < 1 || actions.length > 8) {
    errors.push('A visual draft requires between one and eight actions.');
  }

  const validateEntityArray = (value, path) => {
    if (!Array.isArray(value) || !value.length) {
      errors.push(`${path} must be a non-empty string array.`);
      return [];
    }
    for (const entityId of value) {
      if (!entityIds.has(entityId)) errors.push(`Unknown entity at ${path}: ${entityId}`);
    }
    return value;
  };

  for (const [index, trigger] of triggers.entries()) {
    const kind = text(trigger?.platform || trigger?.trigger);
    if (!registry.triggerKinds.includes(kind)) {
      errors.push(`triggers[${index}] uses a trigger kind outside visual capabilities: ${kind || '<missing>'}.`);
    }
    const triggerEntityIds = Array.isArray(trigger?.entity_id) ? trigger.entity_id : [];
    if (['state', 'numeric_state'].includes(kind) && !triggerEntityIds.length) {
      errors.push(`triggers[${index}].entity_id must be a non-empty string array.`);
    } else if (trigger?.entity_id != null && !Array.isArray(trigger.entity_id)) {
      errors.push(`triggers[${index}].entity_id must be an array.`);
    }
    for (const entityId of triggerEntityIds) {
      if (!entityIds.has(entityId)) errors.push(`Unknown trigger entity: ${entityId}`);
    }
  }

  const requestedServices = Array.isArray(options.allowed_services) && options.allowed_services.length
    ? new Set(options.allowed_services)
    : new Set(registry.services.map((service) => service.id));

  const validateCondition = (condition, path) => {
    if (typeof condition === 'string') return;
    if (!condition || typeof condition !== 'object' || Array.isArray(condition)) {
      errors.push(`${path} must be a condition object or template string.`);
      return;
    }
    for (const logic of ['and', 'or', 'not']) {
      if (Array.isArray(condition[logic])) {
        condition[logic].forEach((child, childIndex) => validateCondition(child, `${path}.${logic}[${childIndex}]`));
        return;
      }
    }
    const kind = text(condition.condition);
    if (!registry.conditionKinds.includes(kind)) {
      errors.push(`${path} uses a condition kind outside visual capabilities: ${kind || '<missing>'}.`);
    }
    if (condition.entity_id != null) validateEntityArray(condition.entity_id, `${path}.entity_id`);
    if (Array.isArray(condition.conditions)) {
      condition.conditions.forEach((child, childIndex) => validateCondition(child, `${path}.conditions[${childIndex}]`));
    }
  };

  (Array.isArray(automation?.conditions) ? automation.conditions : [])
    .forEach((condition, index) => validateCondition(condition, `conditions[${index}]`));

  const validateAction = (action, path) => {
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      errors.push(`${path} must be an action object.`);
      return;
    }
    if (action.delay != null) return;
    if (Array.isArray(action.choose)) {
      for (const [choiceIndex, choice] of action.choose.entries()) {
        (Array.isArray(choice?.conditions) ? choice.conditions : [])
          .forEach((condition, conditionIndex) => validateCondition(
            condition,
            `${path}.choose[${choiceIndex}].conditions[${conditionIndex}]`,
          ));
        const sequence = Array.isArray(choice?.sequence?.items)
          ? choice.sequence.items
          : Array.isArray(choice?.sequence) ? choice.sequence : [];
        sequence.forEach((child, childIndex) => validateAction(child, `${path}.choose[${choiceIndex}].sequence[${childIndex}]`));
      }
      const defaults = Array.isArray(action.default?.items)
        ? action.default.items
        : Array.isArray(action.default) ? action.default : [];
      defaults.forEach((child, childIndex) => validateAction(child, `${path}.default[${childIndex}]`));
      return;
    }

    const service = text(action.service || action.action);
    if (action.action && action.service && action.action !== action.service) {
      errors.push(`${path} action and service must match.`);
    }
    const capability = capabilityForService(service, registry);
    if (!capability || capability.available_in_home === false) {
      errors.push(`${path} uses a service outside visual capabilities: ${service || '<missing>'}.`);
      return;
    }
    if (!requestedServices.has(service)) {
      errors.push(`${path} uses a service outside the requested scope: ${service}.`);
    }
    const targetValue = action?.target?.entity_id;
    if (capability.target_required || targetValue != null) {
      const targetEntityIds = validateEntityArray(targetValue, `${path}.target.entity_id`);
      for (const entityId of targetEntityIds) {
        if (entityIds.has(entityId) && !isServiceCompatibleWithEntity(service, entityId, registry)) {
          errors.push(`${path} target ${entityId} is incompatible with ${service}.`);
        }
      }
    }
  };

  actions.forEach((action, index) => validateAction(action, `actions[${index}]`));

  return {
    schema_valid: schemaValidation.valid,
    schema_version: schemaValidation.schema_version,
    grounded: errors.every((error) => !error.startsWith('Unknown')),
    blockly_supported: errors.length === 0,
    errors,
  };
}

export function createFakeAutomationDraft(payload = {}) {
  const command = text(payload.command);
  const cards = Array.isArray(payload.entity_cards) ? payload.entity_cards : [];
  const selections = payload.selections && typeof payload.selections === 'object'
    ? payload.selections
    : {};

  if (!command) {
    return { status: 'failure', error: 'command is required' };
  }
  if (!cards.length) {
    return { status: 'failure', error: 'No Home Assistant entities are available.' };
  }
  if (!MOTION_RE.test(command) || !TURN_ON_RE.test(command)) {
    return {
      status: 'unsupported',
      reason: 'The fake prototype provider supports only motion-detected light-on automations.',
    };
  }

  const triggerCandidates = rankedCandidates(
    command,
    cards,
    (card) => card.domain === 'binary_sensor',
    'trigger',
  );
  const actionCandidates = rankedCandidates(
    command,
    cards,
    (card) => card.domain === 'light',
    'action',
  );

  const trigger = resolveCandidate(command, triggerCandidates, selections.trigger_entity_id);
  if (trigger === undefined) return confirmation('trigger', triggerCandidates);
  if (trigger === null) {
    return { status: 'unsupported', reason: 'No motion sensor matched the request.' };
  }

  const actionTarget = resolveCandidate(command, actionCandidates, selections.action_entity_id);
  if (actionTarget === undefined) return confirmation('action', actionCandidates);
  if (actionTarget === null) {
    return { status: 'unsupported', reason: 'No light matched the request.' };
  }

  const automation = {
    alias: `Turn on ${actionTarget.friendly_name || actionTarget.entity_id} when ${trigger.friendly_name || trigger.entity_id} detects motion`,
    triggers: [{
      platform: 'state',
      entity_id: [trigger.entity_id],
      from: 'off',
      to: 'on',
    }],
    conditions: [],
    actions: [{
      action: 'light.turn_on',
      service: 'light.turn_on',
      target: { entity_id: [actionTarget.entity_id] },
      data: {},
    }],
  };
  const validation = validateDraft(automation, cards);

  if (validation.errors.length) {
    return { status: 'failure', error: 'Generated draft failed validation.', validation };
  }

  return {
    status: 'success',
    provider: 'fake',
    automation,
    validation,
    selected_entities: {
      trigger: trigger.entity_id,
      action: actionTarget.entity_id,
    },
  };
}
