import { validateAutomationIr } from '../src/automation_ir/schema.mjs';
import {
  applyConservativeDraftPolicy,
  analyzeAutomationGoal,
  validateSemanticAlignment,
} from './automation_goal_analyzer.mjs';
import { requestOllamaDraft } from './ollama_automation_provider.mjs';
import { OLLAMA_DRAFT_RESPONSE_SCHEMA } from './ollama_automation_provider.mjs';
import { validateJsonSchema } from './json_schema_validator.mjs';

export const LLM_PIPELINE_VERSION = '0.3.0';

const TURN_ON_RE = /(켜|켜줘|turn\s+on|switch\s+on)/i;
const MOTION_RE = /(움직임|움직|모션|motion|movement|presence)/i;
const TRIGGER_LANGUAGE_RE = /\b(?:when|whenever|if|after|before|once)\b|(?:감지|움직임|열리|닫히).*(?:면|때)|(?:되면|할\s*때)/iu;

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

export function buildEntityCards(states) {
  if (!Array.isArray(states)) return [];

  return states.flatMap((state) => {
    if (!state || typeof state !== 'object') return [];
    const entityId = text(state.entity_id);
    if (!entityId.includes('.')) return [];
    const attributes = state.attributes && typeof state.attributes === 'object'
      ? state.attributes
      : {};
    const domain = entityId.split('.', 1)[0];

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
      supported_actions: domain === 'light'
        ? ['light.turn_on', 'light.turn_off']
        : [],
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

function explicitLightService(command) {
  const onMatch = text(command).match(/(?:켜\s*(?:줘|줘요|주세요|라)?|turn\s+on|switch\s+on)/iu);
  const offMatch = text(command).match(/(?:꺼\s*(?:줘|줘요|주세요|라)?|끄\s*(?:기|세요|라고|도록|자)?|turn\s+off|switch\s+off)/iu);
  if (Boolean(onMatch) === Boolean(offMatch)) return null;
  const match = onMatch || offMatch;
  return {
    service: onMatch ? 'light.turn_on' : 'light.turn_off',
    phrase: match[0],
  };
}

function explicitTargetScore(command, card) {
  const source = normalized(command);
  const entityId = normalized(card.entity_id);
  const entityTail = normalized(text(card.entity_id).split('.').slice(1).join(' '));
  const friendlyName = normalized(card.friendly_name);
  const area = normalized(card.area);
  let score = 0;
  if (entityId && source.includes(entityId)) score += 100;
  if (entityTail && source.includes(entityTail)) score += 80;
  if (friendlyName && source.includes(friendlyName)) score += 60;
  if (area && source.includes(area)) score += 40;
  const ignored = /^(?:light|lights|lamp|lamps|불|불을|조명|조명을|켜줘|꺼줘|켜|꺼|끄|turn|switch|on|off)$/iu;
  for (const field of [friendlyName, area, entityTail]) {
    for (const token of field.split(' ').filter((item) => item.length > 1 && !ignored.test(item))) {
      if (source.includes(token)) score += 5;
    }
  }
  return score;
}

function tryExplicitManualLightFastPath(payload) {
  const conversation = Array.isArray(payload.conversation) ? payload.conversation : [];
  const command = conversation.length
    ? conversation.filter((turn) => turn?.role === 'user').map((turn) => text(turn.content)).filter(Boolean).join('\n')
    : text(payload.command);
  const explicit = explicitLightService(command);
  if (!explicit || TRIGGER_LANGUAGE_RE.test(command)) return null;

  const supportedLights = (Array.isArray(payload.entity_cards) ? payload.entity_cards : [])
    .filter((card) => card?.domain === 'light' && card.supported_actions?.includes(explicit.service));
  if (!supportedLights.length) return null;

  const selectedId = text(payload.selections?.action_entity_id);
  let target = selectedId
    ? supportedLights.find((card) => card.entity_id === selectedId)
    : null;
  const ranked = supportedLights
    .map((card) => ({ card, score: explicitTargetScore(command, card) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.card.entity_id.localeCompare(b.card.entity_id));

  if (!target && ranked.length === 1) target = ranked[0].card;
  if (!target && ranked.length > 1 && ranked[0].score > ranked[1].score) target = ranked[0].card;
  if (!target && !ranked.length && supportedLights.length === 1) target = supportedLights[0];
  if (!target) {
    if (!ranked.length) return null;
    return confirmation('action', ranked);
  }

  const automation = {
    alias: `${target.friendly_name || target.entity_id} ${explicit.service === 'light.turn_on' ? 'on' : 'off'} · AI Draft`,
    triggers: [],
    conditions: [],
    actions: [{
      service: explicit.service,
      target: { entity_id: [target.entity_id] },
      data: {},
    }],
  };
  const validation = validateDraft(automation, payload.entity_cards, {
    allowed_services: [explicit.service],
    allow_manual_trigger: true,
  });
  if (validation.errors.length) return null;

  const goalAnalysis = {
    status: 'ready',
    goal_type: 'automation_creation',
    goal_category: 'lighting',
    home_supports_goal: true,
    trigger_specified: false,
    trigger_kind: 'none',
    primary_service: explicit.service,
    requested_services: [explicit.service],
    action_source: 'explicit',
    target_scope: 'specific',
    target_hints: [],
    target_entity_ids: [target.entity_id],
    risk_level: 'low',
    confidence: 100,
    assumptions: [],
    questions: [],
    reason: 'A reversible manual lighting action and a unique grounded target were detected locally.',
    evidence: { trigger_phrase: '', action_phrase: explicit.phrase, target_phrase: '' },
    inferred_action: false,
  };
  return {
    status: 'success',
    provider: 'local-fast-path',
    automation,
    validation,
    semantic_validation: { aligned: true, errors: [] },
    selected_entities: { trigger: [], action: [target.entity_id] },
    pipeline: {
      stage: 'complete',
      mode: 'explicit_manual_light_fast_path',
      timings_ms: { goal_analysis: 0, planning: 0, total: 0 },
      goal_analysis: goalAnalysis,
      ollama_calls: [],
    },
  };
}

export function validateDraft(automation, cards, options = {}) {
  const schemaValidation = validateAutomationIr(automation);
  const errors = [...schemaValidation.errors];
  const entityIds = new Set(cards.map((card) => card.entity_id));
  const triggers = Array.isArray(automation?.triggers) ? automation.triggers : [];
  const actions = Array.isArray(automation?.actions) ? automation.actions : [];
  const allowManualTrigger = options.allow_manual_trigger === true;

  if (triggers.length > 1 || (triggers.length === 0 && !allowManualTrigger)) {
    errors.push('MVP requires one trigger, or no trigger for an explicitly manual draft.');
  }
  if (actions.length !== 1) {
    errors.push('MVP requires exactly one action.');
  }
  if ((automation?.conditions || []).length !== 0) {
    errors.push('MVP does not support conditions yet.');
  }

  if (triggers.length === 1) {
    const triggerPlatform = triggers[0]?.platform || triggers[0]?.trigger;
    if (triggerPlatform !== 'state') errors.push('MVP only supports state triggers.');
    if (!Array.isArray(triggers[0]?.entity_id) || triggers[0].entity_id.length === 0) {
      errors.push('State trigger entity_id must be a non-empty string array.');
    }
    if (triggers[0]?.from != null && triggers[0]?.from !== 'off') {
      errors.push('MVP motion trigger from must be "off" when provided.');
    }
    if (triggers[0]?.to !== 'on') errors.push('MVP motion trigger requires to "on".');

    const triggerEntityIds = Array.isArray(triggers[0]?.entity_id)
      ? triggers[0].entity_id
      : [triggers[0]?.entity_id].filter(Boolean);
    for (const entityId of triggerEntityIds) {
      if (!entityIds.has(entityId)) errors.push(`Unknown trigger entity: ${entityId}`);
    }
  }

  const requestedServices = Array.isArray(options.allowed_services) && options.allowed_services.length
    ? new Set(options.allowed_services)
    : new Set(['light.turn_on', 'light.turn_off']);
  const cardsById = new Map(cards.map((card) => [card.entity_id, card]));
  for (const [index, action] of actions.entries()) {
    const service = text(action?.action || action?.service);
    if (action?.action && action?.service && action.action !== action.service) {
      errors.push(`actions[${index}] action and service must match.`);
    }
    if (!requestedServices.has(service)) {
      errors.push(`actions[${index}] uses a service outside the requested scope: ${service || '<missing>'}.`);
    }
    const targetEntityIds = Array.isArray(action?.target?.entity_id)
      ? action.target.entity_id
      : [action?.target?.entity_id].filter(Boolean);
    if (!Array.isArray(action?.target?.entity_id) || targetEntityIds.length === 0) {
      errors.push(`actions[${index}] target.entity_id must be a non-empty string array.`);
    }
    for (const entityId of targetEntityIds) {
      if (!entityIds.has(entityId)) {
        errors.push(`Unknown action entity: ${entityId}`);
        continue;
      }
      const hints = cardsById.get(entityId)?.supported_actions || [];
      if (!hints.includes(service)) {
        errors.push(`Entity ${entityId} does not advertise service ${service}.`);
      }
    }
  }

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
            trigger: output.automation.triggers[0]?.entity_id || [],
            action: output.automation.actions[0].target?.entity_id,
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
    const fastPath = text(env.LLM_ENABLE_FAST_PATH).toLocaleLowerCase() === 'false'
      ? null
      : tryExplicitManualLightFastPath(payload);
    if (fastPath) {
      const total = Date.now() - pipelineStartedAt;
      if (fastPath.pipeline) {
        fastPath.pipeline.timings_ms.total = total;
        return fastPath;
      }
      return {
        ...fastPath,
        provider: 'local-fast-path',
        pipeline: {
          stage: 'confirmation',
          mode: 'explicit_manual_light_fast_path',
          timings_ms: { goal_analysis: 0, planning: 0, total },
          ollama_calls: [],
        },
      };
    }
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

    const conversation = Array.isArray(payload.conversation) ? payload.conversation : [];
    const combinedCommand = conversation.length
      ? conversation
        .filter((turn) => turn?.role === 'user')
        .map((turn) => text(turn.content))
        .filter(Boolean)
        .join('\n')
      : payload.command;
    if (goal.goal_analysis.inferred_action) {
      const policyResult = applyConservativeDraftPolicy({
        alias: `${text(combinedCommand)} · AI Draft`,
        triggers: [],
        conditions: [],
        actions: [],
      }, goal.goal_analysis, payload.entity_cards);
      const validation = validateDraft(policyResult.automation, payload.entity_cards, {
        allowed_services: goal.goal_analysis.requested_services,
        allow_manual_trigger: true,
      });
      const semanticValidation = validateSemanticAlignment(
        policyResult.automation,
        goal.goal_analysis,
        payload.entity_cards,
      );
      const timings = {
        goal_analysis: goalAnalysisMs,
        planning: 0,
        total: Date.now() - pipelineStartedAt,
      };
      if (validation.errors.length || !semanticValidation.aligned) {
        return {
          status: 'unsupported',
          provider: 'ollama',
          model: goal.model,
          reason: 'No draft can be produced from the currently supported low-risk actions.',
          validation,
          semantic_validation: semanticValidation,
          pipeline: {
            stage: 'policy_validation',
            timings_ms: timings,
            goal_analysis: goal.goal_analysis,
            policy_notes: policyResult.notes,
            ollama_calls: goal.ollama_calls || [],
          },
        };
      }
      return {
        status: 'success',
        provider: 'ollama',
        model: goal.model,
        automation: policyResult.automation,
        validation,
        semantic_validation: semanticValidation,
        selected_entities: {
          trigger: [],
          action: policyResult.automation.actions.flatMap(
            (action) => action.target?.entity_id || [],
          ),
        },
        pipeline: {
          stage: 'complete',
          timings_ms: timings,
          goal_analysis: goal.goal_analysis,
          policy_notes: policyResult.notes,
          ollama_calls: goal.ollama_calls || [],
        },
      };
    }
    const planningStartedAt = Date.now();
    const result = await createOllamaAutomationDraft({
      ...payload,
      command: combinedCommand,
      goal_analysis: goal.goal_analysis,
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
          ? 'There are no supported lights currently on, so there is nothing to change.'
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
