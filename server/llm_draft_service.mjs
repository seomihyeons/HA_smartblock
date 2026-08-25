import { validateAutomationIr } from '../src/automation_ir/schema.mjs';
import {
  applyConservativeDraftPolicy,
  analyzeAutomationGoal,
  validateSemanticAlignment,
} from './automation_goal_analyzer.mjs';
import {
  capabilityForService,
  createCapabilityRegistry,
  isServiceCompatibleWithEntity,
  servicesForEntityDomain,
} from './capability_registry.mjs';
import { requestOllamaDraft } from './ollama_automation_provider.mjs';
import { OLLAMA_DRAFT_RESPONSE_SCHEMA } from './ollama_automation_provider.mjs';
import { validateJsonSchema } from './json_schema_validator.mjs';

export const LLM_PIPELINE_VERSION = '0.4.0';

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

function confirmationFromModel(output, cards) {
  if (output?.role !== 'trigger' && output?.role !== 'action') {
    return null;
  }
  const cardsById = new Map(cards.map((card) => [card.entity_id, card]));
  const candidateIds = uniqueStrings(output.candidate_entity_ids).slice(0, 8);
  const candidates = candidateIds.flatMap((entityId) => {
    const card = cardsById.get(entityId);
    if (!card) return [];
    return [{
      entity_id: card.entity_id,
      name: card.friendly_name || card.entity_id,
      area: card.area || null,
    }];
  });
  if (!candidates.length) return null;

  return {
    status: 'needs_confirmation',
    provider: 'ollama',
    role: output.role,
    question: text(output.question) || 'Select the entity to use.',
    candidates,
  };
}

export async function createOllamaAutomationDraft(payload = {}, options = {}) {
  const command = text(payload.command);
  const cards = Array.isArray(payload.entity_cards) ? payload.entity_cards : [];
  if (!command) return { status: 'failure', provider: 'ollama', error: 'command is required' };
  if (!cards.length) {
    return {
      status: 'failure',
      provider: 'ollama',
      error: 'No Home Assistant entities are available.',
    };
  }

  let repair = '';
  let lastErrors = [];
  const ollamaCalls = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response;
    try {
      response = await requestOllamaDraft(payload, { ...options, repair });
      ollamaCalls.push({
        stage: 'planning',
        attempt: attempt + 1,
        context_entities: response.entity_cards.length,
        ...response.performance,
      });
    } catch (error) {
      const message = text(error?.message || error);
      if (attempt === 0 && message.includes('invalid JSON')) {
        repair = message;
        lastErrors = [message];
        continue;
      }
      throw error;
    }

    const output = response.output;
    const responseValidation = validateJsonSchema(OLLAMA_DRAFT_RESPONSE_SCHEMA, output);
    if (!responseValidation.valid) {
      lastErrors = responseValidation.errors;
    } else if (output.status === 'unsupported') {
      return {
        status: 'unsupported',
        provider: 'ollama',
        model: response.model,
        reason: text(output.reason) || 'This request is outside the currently supported scope.',
        ollama_calls: ollamaCalls,
      };
    } else if (output.status === 'needs_confirmation') {
      const result = confirmationFromModel(output, response.entity_cards);
      if (result) return { ...result, model: response.model, ollama_calls: ollamaCalls };
      lastErrors = ['needs_confirmation must contain valid candidate entity IDs.'];
    } else if (output.status === 'success') {
      const validation = validateDraft(output.automation, cards, {
        allowed_services: payload.goal_analysis?.requested_services,
        allow_manual_trigger: payload.goal_analysis?.trigger_kind === 'none',
      });
      if (!validation.errors.length) {
        return {
          status: 'success',
          provider: 'ollama',
          model: response.model,
          automation: output.automation,
          validation,
          selected_entities: {
            trigger: output.automation.triggers.flatMap((trigger) => trigger?.entity_id || []),
            action: output.automation.actions.flatMap((action) => action?.target?.entity_id || []),
          },
          ollama_calls: ollamaCalls,
        };
      }
      lastErrors = validation.errors;
    } else {
      lastErrors = ['status must be success, needs_confirmation, or unsupported.'];
    }

    repair = lastErrors.join(' ');
  }

  return {
    status: 'failure',
    provider: 'ollama',
    error: 'The Ollama draft failed validation after one repair attempt.',
    validation: { errors: lastErrors },
    ollama_calls: ollamaCalls,
  };
}

export async function createAutomationDraft(payload = {}, options = {}) {
  const env = options.env || process.env;
  const provider = text(env.LLM_PROVIDER || 'fake').toLocaleLowerCase();
  if (provider === 'fake') {
    return { ...createFakeAutomationDraft(payload), provider: 'fake' };
  }
  if (provider === 'ollama') {
    const pipelineStartedAt = Date.now();
    const goalStartedAt = Date.now();
    const goal = await analyzeAutomationGoal(payload, options);
    const goalAnalysisMs = Date.now() - goalStartedAt;
    if (goal.status !== 'ready') {
      return {
        ...goal,
        pipeline: {
          stage: goal.status === 'needs_clarification' ? 'clarification' : 'goal_analysis',
          timings_ms: {
            goal_analysis: goalAnalysisMs,
            total: Date.now() - pipelineStartedAt,
          },
          ollama_calls: goal.ollama_calls || [],
        },
      };
    }

    if (payload.interaction_mode === 'auto' && goal.goal_analysis.goal_type === 'immediate_control') {
      if (goal.goal_analysis.risk_level !== 'low') {
        return {
          status: 'unsupported',
          provider: 'ollama',
          model: goal.model,
          reason: 'This capability is draft-only under the current safety policy.',
          pipeline: {
            stage: 'safety_policy',
            timings_ms: { goal_analysis: goalAnalysisMs, total: Date.now() - pipelineStartedAt },
            goal_analysis: goal.goal_analysis,
            ollama_calls: goal.ollama_calls || [],
          },
        };
      }
      const service = goal.goal_analysis.primary_service;
      const explicitTargets = goal.goal_analysis.target_entity_ids || [];
      const compatibleTargets = (Array.isArray(payload.entity_cards) ? payload.entity_cards : [])
        .filter((card) => card.supported_actions?.includes(service))
        .map((card) => card.entity_id);
      return {
        status: 'control_intent',
        provider: 'ollama',
        model: goal.model,
        service,
        candidate_entity_ids: explicitTargets.length ? explicitTargets : compatibleTargets,
        pipeline: {
          stage: 'control_intent',
          timings_ms: { goal_analysis: goalAnalysisMs, total: Date.now() - pipelineStartedAt },
          goal_analysis: goal.goal_analysis,
          ollama_calls: goal.ollama_calls || [],
        },
      };
    }

    const conversation = Array.isArray(payload.conversation) ? payload.conversation : [];
    const combinedCommand = conversation.length
      ? conversation
        .filter((turn) => turn?.role === 'user')
        .map((turn) => text(turn.content))
        .filter(Boolean)
        .join('\n')
      : payload.command;
    const planningStartedAt = Date.now();
    const result = await createOllamaAutomationDraft({
      ...payload,
      command: combinedCommand,
      goal_analysis: goal.goal_analysis,
      retrieved_entity_cards: goal.retrieval?.cards,
    }, options);
    const planningMs = Date.now() - planningStartedAt;
    const timings = {
      goal_analysis: goalAnalysisMs,
      planning: planningMs,
      total: Date.now() - pipelineStartedAt,
    };
    if (result.status !== 'success') {
      return {
        ...result,
        pipeline: {
          stage: 'planning',
          timings_ms: timings,
          goal_analysis: goal.goal_analysis,
          ollama_calls: [...(goal.ollama_calls || []), ...(result.ollama_calls || [])],
        },
      };
    }
    const policyResult = applyConservativeDraftPolicy(
      result.automation,
      goal.goal_analysis,
      payload.entity_cards,
    );
    const policyValidation = validateDraft(policyResult.automation, payload.entity_cards, {
      allowed_services: goal.goal_analysis.requested_services,
      allow_manual_trigger: goal.goal_analysis.trigger_kind === 'none',
    });
    if (policyValidation.errors.length) {
      const noInferredTargets = goal.goal_analysis.inferred_action
        && policyResult.automation.actions.length === 0;
      return {
        status: noInferredTargets ? 'unsupported' : 'failure',
        provider: 'ollama',
        model: result.model,
        reason: noInferredTargets
          ? 'There are no compatible grounded targets for the inferred action.'
          : undefined,
        error: noInferredTargets ? undefined : 'The conservative draft policy produced an invalid draft.',
        validation: policyValidation,
        pipeline: {
          stage: 'policy_validation',
          timings_ms: timings,
          goal_analysis: goal.goal_analysis,
          policy_notes: policyResult.notes,
          ollama_calls: [...(goal.ollama_calls || []), ...(result.ollama_calls || [])],
        },
      };
    }
    const semanticValidation = validateSemanticAlignment(
      policyResult.automation,
      goal.goal_analysis,
      payload.entity_cards,
    );
    if (!semanticValidation.aligned) {
      return {
        status: 'failure',
        provider: 'ollama',
        model: result.model,
        error: 'The generated draft does not match the analyzed user intent.',
        validation: { errors: semanticValidation.errors },
        pipeline: {
          stage: 'semantic_feedback',
          timings_ms: timings,
          goal_analysis: goal.goal_analysis,
          ollama_calls: [...(goal.ollama_calls || []), ...(result.ollama_calls || [])],
        },
      };
    }
    return {
      ...result,
      automation: policyResult.automation,
      validation: policyValidation,
      semantic_validation: semanticValidation,
      pipeline: {
        stage: 'complete',
        timings_ms: timings,
        goal_analysis: goal.goal_analysis,
        policy_notes: policyResult.notes,
        ollama_calls: [...(goal.ollama_calls || []), ...(result.ollama_calls || [])],
      },
    };
  }
  throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
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
