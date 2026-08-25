import {
  requestOllamaStructured,
} from './ollama_automation_provider.mjs';
import { retrieveEntityContext } from './entity_retriever.mjs';
import { scopeCapabilityContext } from './capability_registry.mjs';
import { validateJsonSchema } from './json_schema_validator.mjs';

export const GOAL_PROMPT_VERSION = '2026-08-25.1';

export const GOAL_ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'status',
    'goal_type',
    'goal_category',
    'home_supports_goal',
    'trigger_specified',
    'trigger_kind',
    'primary_service',
    'requested_services',
    'action_source',
    'target_scope',
    'target_hints',
    'target_entity_ids',
    'risk_level',
    'confidence',
    'assumptions',
    'questions',
    'reason',
    'evidence',
  ],
  properties: {
    status: { type: 'string', enum: ['ready', 'needs_clarification', 'unsupported'] },
    goal_type: {
      type: 'string',
      enum: ['automation_creation', 'immediate_control', 'ambiguous'],
    },
    goal_category: {
      type: 'string',
    },
    home_supports_goal: { type: 'boolean' },
    trigger_specified: { type: 'boolean' },
    trigger_kind: { type: 'string' },
    primary_service: {
      type: 'string',
    },
    requested_services: {
      type: 'array',
      items: { type: 'string' },
    },
    action_source: { type: 'string', enum: ['explicit', 'inferred', 'unknown'] },
    target_scope: { type: 'string', enum: ['specific', 'all', 'unspecified'] },
    target_hints: { type: 'array', items: { type: 'string' } },
    target_entity_ids: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    risk_level: { type: 'string', enum: ['low', 'medium', 'high'] },
    confidence: { type: 'integer', minimum: 0, maximum: 100 },
    assumptions: { type: 'array', items: { type: 'string' }, maxItems: 3 },
    questions: { type: 'array', items: { type: 'string' }, maxItems: 1 },
    reason: { type: 'string' },
    evidence: {
      type: 'object',
      additionalProperties: false,
      required: ['trigger_phrase', 'action_phrase', 'target_phrase'],
      properties: {
        trigger_phrase: { type: 'string' },
        action_phrase: { type: 'string' },
        target_phrase: { type: 'string' },
      },
    },
  },
};

const GOAL_ANALYZER_PROMPT = `You analyze a user's goal for a Home Assistant automation. Do not generate automation JSON. Determine only whether the goal is sufficiently clear and feasible in the supplied home context.

Rules:
1. interaction_mode=automation always means goal_type=automation_creation. In interaction_mode=auto, a direct action with no trigger is immediate_control; a conditional, scheduled, or explicitly requested rule is automation_creation. You only classify intent and never execute it.
2. If no trigger is stated, do not ask for one. Set trigger_specified=false and trigger_kind=none, and plan a manually runnable draft.
3. Use only capabilities and entity actions supplied in home_context. Capability support is determined by service and structure, not by a broad semantic category.
4. For a low-risk, reversible draft, you may infer the smallest common-sense plan from an abstract goal. Record every inference in assumptions. Never infer a medium- or high-risk action.
5. Set action_source=explicit only when the conversation directly states the action, and copy the exact action wording into evidence.action_phrase. Set action_source=inferred only when the action is inferred, leave evidence.action_phrase empty, and state the rationale in assumptions.
6. The supported planning scope is exactly home_context.capabilities. Return unsupported only when the required trigger, condition, action structure, or service is absent from that context.
7. Assess feasibility only from the provided entities and supported_actions.
8. Every non-empty evidence value and every target_hints item must be an exact contiguous substring of conversation. Use an empty string when no such evidence exists.
9. Ask at most one question, and only when the uncertainty would materially change the plan.
10. Return ready for an explicit supported action. For every inferred medium- or high-risk action, return needs_clarification or unsupported.
11. Choose the smallest sufficient device set. Prefer entities whose advertised actions contain the selected service.
12. goal_category is a descriptive scenario or domain label only. It never decides capability support or execution permission.
13. primary_service is the single most important action and must be copied exactly from home_context.capabilities.services. When status=ready, it must not be none and the same value must appear in requested_services.
14. confidence is an integer percentage from 0 to 100. Use 70 or higher only for high confidence.
15. Set target_scope=specific when the user identifies a room or device, all only when the user explicitly requests all matching devices, and unspecified when no target is stated. For specific targets, copy exact target wording into target_hints and evidence.target_phrase, and put only matching IDs from home_context.entities into target_entity_ids. Never invent an entity ID.
16. When status=needs_clarification, leave unconfirmed requested_services, target_hints, and target_entity_ids empty and use action_source=unknown.
17. Write questions, assumptions, and reason in the language used by the user.
18. Return exactly one object conforming to the provided JSON Schema.`;

function text(value) {
  return String(value ?? '').trim();
}

function conversationText(payload) {
  const turns = Array.isArray(payload.conversation) ? payload.conversation : [];
  if (!turns.length) return text(payload.command);
  return turns
    .filter((turn) => turn && turn.role === 'user')
    .map((turn) => text(turn.content))
    .filter(Boolean)
    .join('\n');
}

function phraseAppears(phrase, source) {
  const value = text(phrase).toLocaleLowerCase();
  return Boolean(value) && text(source).toLocaleLowerCase().includes(value);
}

const VAGUE_ACTION_EVIDENCE_RE = /(?:뭔가|무언가|아무거나|알아서|something|anything|whatever)/iu;
const CONDITIONAL_TRIGGER_RE = /^\s*(?:when(?:ever)?|if|after|before|once|every|at\b)|(?:면|때|후|전|마다|시에)(?:\s|,|$)/iu;
const TIME_TRIGGER_RE = /(?:\b(?:at|every)\s+\d|\b(?:daily|weekly)\b|\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}\s*시|매일|매주|마다)/iu;
const ALL_SCOPE_RE = /(?:\ball\b|\bevery\b|모든|전부|전체|모두|다\s*(?:켜|꺼|끄|닫|열))/iu;
const MULTI_TARGET_RE = /(?:\band\b|\s및\s|와\s|과\s|,)/iu;

function triggerClause(source) {
  const value = text(source);
  const english = value.match(/^\s*((?:when(?:ever)?|if|after|before|once|every|at\b).+?)(?:,|\bthen\b)/iu);
  const korean = value.match(/^\s*(.+?(?:면|때|후|전|마다|시에))(?:\s|,)/u);
  const phrase = text(english?.[1] || korean?.[1]);
  if (!phrase) return null;
  return { phrase, kind: TIME_TRIGGER_RE.test(phrase) ? 'time' : 'state' };
}

function normalized(value) {
  return text(value)
    .toLocaleLowerCase()
    .replace(/[_\-.()/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cardMatchesTargetHints(card, hints) {
  const fields = [card?.entity_id, card?.friendly_name, card?.area]
    .map(normalized)
    .filter(Boolean);
  return hints.some((hint) => {
    const value = normalized(hint);
    return Boolean(value) && fields.some((field) => field.includes(value) || value.includes(field));
  });
}

function cardMatchesAnalysisTarget(card, analysis) {
  const selectedIds = new Set(analysis?.target_entity_ids || []);
  if (selectedIds.size) return selectedIds.has(card?.entity_id);
  return cardMatchesTargetHints(card, analysis?.target_hints || []);
}

function sourceMentionsCard(source, card) {
  const value = normalized(source);
  return [card?.entity_id, card?.friendly_name, card?.area]
    .map(normalized)
    .filter(Boolean)
    .some((candidate) => value.includes(candidate));
}

function normalizeGoalAnalysis(analysis, sourceText, cards) {
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) return analysis;
  const normalizedAnalysis = typeof structuredClone === 'function'
    ? structuredClone(analysis)
    : JSON.parse(JSON.stringify(analysis));
  const explicitTrigger = triggerClause(sourceText);
  if (normalizedAnalysis.status === 'ready' && explicitTrigger) {
    normalizedAnalysis.trigger_specified = true;
    normalizedAnalysis.trigger_kind = explicitTrigger.kind;
    normalizedAnalysis.evidence = {
      ...(normalizedAnalysis.evidence || {}),
      trigger_phrase: explicitTrigger.phrase,
    };
  }
  if (normalizedAnalysis.trigger_specified === false && normalizedAnalysis.evidence) {
    normalizedAnalysis.evidence.trigger_phrase = '';
  }

  const cardIds = new Set((cards || []).map((card) => card.entity_id));
  const targetIds = Array.isArray(normalizedAnalysis.target_entity_ids)
    ? normalizedAnalysis.target_entity_ids.filter((entityId) => cardIds.has(entityId))
    : [];
  const targetPhrase = text(normalizedAnalysis.evidence?.target_phrase);
  if (cardIds.has(targetPhrase) && !targetIds.includes(targetPhrase)) {
    targetIds.push(targetPhrase);
    normalizedAnalysis.evidence.target_phrase = '';
  }
  normalizedAnalysis.target_entity_ids = [...new Set(targetIds)];

  const requestedService = text(normalizedAnalysis.primary_service);
  const targetPhraseForGrounding = text(normalizedAnalysis.evidence?.target_phrase);
  if (
    normalizedAnalysis.status === 'ready'
    && targetPhraseForGrounding
    && !ALL_SCOPE_RE.test(targetPhraseForGrounding)
  ) {
    normalizedAnalysis.target_scope = 'specific';
    if (!MULTI_TARGET_RE.test(targetPhraseForGrounding)) {
      const bestCompatible = cards.find((card) => card?.supported_actions?.includes(requestedService));
      if (bestCompatible) normalizedAnalysis.target_entity_ids = [bestCompatible.entity_id];
    }
  }
  if (normalizedAnalysis.action_source === 'inferred') {
    normalizedAnalysis.evidence = {
      ...(normalizedAnalysis.evidence || {}),
      action_phrase: '',
    };
    const mentionedCardIds = new Set(cards
      .filter((card) => sourceMentionsCard(sourceText, card))
      .map((card) => card.entity_id));
    normalizedAnalysis.target_entity_ids = normalizedAnalysis.target_entity_ids
      .filter((entityId) => mentionedCardIds.has(entityId));
    if (!mentionedCardIds.size) {
      normalizedAnalysis.target_scope = 'unspecified';
      normalizedAnalysis.target_hints = [];
      normalizedAnalysis.target_entity_ids = [];
      normalizedAnalysis.evidence.target_phrase = '';
    }
  }

  const unsupportedExplicitClaim = normalizedAnalysis.action_source === 'explicit'
    && (
      !text(normalizedAnalysis.evidence?.action_phrase)
      || VAGUE_ACTION_EVIDENCE_RE.test(normalizedAnalysis.evidence.action_phrase)
    );
  if (
    normalizedAnalysis.status === 'ready'
    && unsupportedExplicitClaim
  ) {
    const korean = /[가-힣]/u.test(sourceText);
    normalizedAnalysis.status = 'needs_clarification';
    normalizedAnalysis.primary_service = 'none';
    normalizedAnalysis.requested_services = [];
    normalizedAnalysis.action_source = 'unknown';
    normalizedAnalysis.target_hints = [];
    normalizedAnalysis.target_entity_ids = [];
    normalizedAnalysis.questions = [korean
      ? '어떤 동작을 수행해야 하는지 구체적으로 알려주세요.'
      : 'Which specific action should be performed?'];
    normalizedAnalysis.reason = korean
      ? '요청 원문에서 실행할 동작의 근거를 확인할 수 없다.'
      : 'The user wording does not provide evidence for a specific action.';
  }

  return normalizedAnalysis;
}

export function validateGoalAnalysis(analysis, sourceText, cards = []) {
  const schemaValidation = validateJsonSchema(GOAL_ANALYSIS_SCHEMA, analysis);
  const errors = [...schemaValidation.errors];
  if (!schemaValidation.valid) return { valid: false, errors };

  const source = text(sourceText);
  const evidence = analysis.evidence || {};
  for (const key of ['trigger_phrase', 'action_phrase', 'target_phrase']) {
    if (text(evidence[key]) && !phraseAppears(evidence[key], source)) {
      errors.push(`evidence.${key} must be an exact substring of the user conversation.`);
    }
  }
  for (const hint of analysis.target_hints || []) {
    if (!phraseAppears(hint, source)) {
      errors.push('Every target_hints item must be an exact substring of the user conversation.');
    }
  }
  const availableEntityIds = new Set(cards.map((card) => card.entity_id));
  for (const entityId of analysis.target_entity_ids || []) {
    if (!availableEntityIds.has(entityId)) {
      errors.push(`Unknown target entity selected during goal analysis: ${entityId}`);
    }
  }

  if (analysis.status === 'ready') {
    if (analysis.primary_service === 'none') {
      errors.push('A ready analysis must define a primary_service.');
    }
    if (!analysis.requested_services.includes(analysis.primary_service)) {
      errors.push('requested_services must include primary_service for a ready analysis.');
    }
    if (analysis.action_source === 'unknown') {
      errors.push('A ready analysis must classify action_source as explicit or inferred.');
    }
    if (analysis.action_source === 'explicit' && !phraseAppears(evidence.action_phrase, source)) {
      errors.push('An explicit action requires exact action evidence from the user conversation.');
    }
    if (analysis.action_source === 'inferred') {
      if (text(evidence.action_phrase)) errors.push('An inferred action must not contain action evidence.');
      if (analysis.risk_level !== 'low' || !analysis.assumptions.length) {
        errors.push('An inferred action must be low risk and include an explicit assumption.');
      }
    }
    if (analysis.trigger_specified !== (analysis.trigger_kind !== 'none')) {
      errors.push('trigger_specified and trigger_kind are inconsistent.');
    }
    if (CONDITIONAL_TRIGGER_RE.test(source) && !analysis.trigger_specified) {
      errors.push('The request contains an explicit conditional or scheduled trigger clause, but the analysis omitted it.');
    }
    if (analysis.target_scope === 'all' && !ALL_SCOPE_RE.test(source)) {
      errors.push('target_scope=all requires an explicit universal quantifier in the user conversation.');
    }
    if (analysis.trigger_kind !== 'none' && !phraseAppears(evidence.trigger_phrase, source)) {
      errors.push('A specified trigger requires exact trigger evidence from the user conversation.');
    }
    if (
      analysis.target_scope === 'specific'
      && !(analysis.target_hints || []).length
      && !(analysis.target_entity_ids || []).length
    ) {
      errors.push('A specific target requires a grounded target hint or entity ID.');
    }
  }

  return { valid: errors.length === 0, errors };
}

function clarification(analysis, fallbackQuestion) {
  const modelQuestions = Array.isArray(analysis?.questions)
    ? analysis.questions.map(text).filter(Boolean).slice(0, 1)
    : [];
  const safeModelQuestion = modelQuestions[0];
  const question = safeModelQuestion || fallbackQuestion;
  const normalizedAnalysis = {
    ...analysis,
    requested_services: [],
    target_hints: [],
    target_entity_ids: [],
    questions: [question],
  };
  return {
    status: 'needs_clarification',
    provider: 'ollama',
    question,
    questions: [question],
    goal_analysis: normalizedAnalysis,
  };
}

export async function analyzeAutomationGoal(payload = {}, options = {}) {
  const sourceText = conversationText(payload);
  const env = options.env || process.env;
  const configuredMaxCards = Number.parseInt(String(env.LLM_MAX_ENTITY_CARDS || ''), 10);
  const maxCards = Number.isFinite(configuredMaxCards) && configuredMaxCards > 0
    ? configuredMaxCards
    : 16;
  const retrieval = await retrieveEntityContext(sourceText, payload.entity_cards, {
    ...options,
    maxCards,
  });
  const entityCards = retrieval.cards;
  const capabilityContext = payload.capability_context || {
    trigger_kinds: ['state'],
    condition_kinds: [],
    action_structures: ['service'],
    services: [...new Set(entityCards.flatMap((card) => card.supported_actions || []))]
      .map((id) => ({ id, risk: 'low' })),
  };
  const promptCapabilityContext = scopeCapabilityContext(capabilityContext, entityCards);
  promptCapabilityContext.services = promptCapabilityContext.services.map((service) => ({
    id: typeof service === 'string' ? service : service.id,
    risk: typeof service === 'string' ? 'high' : service.risk,
    target_required: typeof service === 'string' ? true : service.target_required,
  }));
  const messages = [
    { role: 'system', content: GOAL_ANALYZER_PROMPT },
    {
      role: 'user',
      content: JSON.stringify({
        interaction_mode: payload.interaction_mode || 'automation',
        conversation: Array.isArray(payload.conversation) && payload.conversation.length
          ? payload.conversation
          : [{ role: 'user', content: text(payload.command) }],
        home_context: {
          entities: entityCards,
          capabilities: promptCapabilityContext,
        },
      }),
    },
  ];
  let response;
  let analysis;
  let analysisValidation = { valid: false, errors: ['No goal analysis was returned.'] };
  let requestMessages = messages;
  const ollamaCalls = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    response = await requestOllamaStructured({
      schema: GOAL_ANALYSIS_SCHEMA,
      messages: requestMessages,
    }, options);
    ollamaCalls.push({
      stage: 'goal_analysis',
      attempt: attempt + 1,
      context_entities: entityCards.length,
      retrieval_method: retrieval.method,
      ...response.performance,
    });
    analysis = normalizeGoalAnalysis(response.output, sourceText, entityCards);
    analysisValidation = validateGoalAnalysis(analysis, sourceText, entityCards);
    if (analysisValidation.valid) break;
    requestMessages = [
      ...messages,
      {
        role: 'user',
        content: `The previous goal analysis failed local validation. Correct every issue and return the complete JSON object only: ${analysisValidation.errors.join(' ')}`,
      },
    ];
  }

  if (!analysisValidation.valid) {
    return {
      status: 'failure',
      provider: 'ollama',
      model: response?.model,
      error: 'Goal analysis failed local validation after one repair attempt.',
      validation: analysisValidation,
      ollama_calls: ollamaCalls,
    };
  }

  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) {
    throw new Error('Goal analyzer returned an invalid object.');
  }
  if (analysis.status === 'unsupported') {
    return {
      status: 'unsupported',
      provider: 'ollama',
      model: response.model,
      reason: text(analysis.reason) || 'This goal is outside the current automation-generation scope.',
      goal_analysis: analysis,
      ollama_calls: ollamaCalls,
    };
  }
  if (analysis.status === 'needs_clarification') {
    return { ...clarification(analysis, 'Describe the desired action and what should start the automation.'), model: response.model, ollama_calls: ollamaCalls };
  }
  const supportedTriggerKinds = new Set(capabilityContext.trigger_kinds || []);
  if (analysis.trigger_kind !== 'none' && !supportedTriggerKinds.has(analysis.trigger_kind)) {
    return { ...clarification(analysis, 'Which supported trigger should start this automation?'), model: response.model, ollama_calls: ollamaCalls };
  }
  const services = Array.isArray(analysis.requested_services)
    ? [...new Set(analysis.requested_services.map(text).filter(Boolean))]
    : [];
  if (!services.length) {
    return {
      ...clarification(analysis, 'Which supported action should this automation perform?'),
      model: response.model,
      ollama_calls: ollamaCalls,
    };
  }
  const actionIsExplicit = analysis.action_source === 'explicit';
  const assumptions = Array.isArray(analysis.assumptions)
    ? analysis.assumptions.map(text).filter(Boolean).slice(0, 3)
    : [];
  if (!actionIsExplicit && (analysis.risk_level !== 'low' || !assumptions.length)) {
    return {
      ...clarification(analysis, 'Which explicit action should replace this unsafe inference?'),
      model: response.model,
      ollama_calls: ollamaCalls,
    };
  }
  if (analysis.trigger_kind !== 'none' && !phraseAppears(analysis.evidence?.trigger_phrase, sourceText)) {
    return { ...clarification(analysis, 'Which entity state change should be used as the trigger?'), model: response.model, ollama_calls: ollamaCalls };
  }
  const capabilityServiceIds = new Set((capabilityContext.services || [])
    .map((service) => typeof service === 'string' ? service : service?.id)
    .map(text)
    .filter(Boolean));
  const serviceCapabilities = new Map((capabilityContext.services || [])
    .map((service) => typeof service === 'string' ? { id: service, risk: 'low' } : service)
    .filter((service) => text(service?.id))
    .map((service) => [text(service.id), service]));
  const riskRank = { low: 0, medium: 1, high: 2 };
  const effectiveRisk = services.reduce((highest, service) => {
    const risk = text(serviceCapabilities.get(service)?.risk) || 'high';
    return riskRank[risk] > riskRank[highest] ? risk : highest;
  }, 'low');
  const supported = services.every((service) => capabilityServiceIds.has(service));
  const targetsCompatible = (analysis.target_entity_ids || []).every((entityId) => {
    const card = entityCards.find((candidate) => candidate.entity_id === entityId);
    return card && services.some((service) => card.supported_actions?.includes(service));
  });
  if (!analysis.home_supports_goal || !supported || !targetsCompatible) {
    return {
      status: 'unsupported',
      provider: 'ollama',
      model: response.model,
      reason: 'This goal cannot be planned with the available Home Assistant entities and supported services.',
      goal_analysis: analysis,
      ollama_calls: ollamaCalls,
    };
  }
  if (!actionIsExplicit && effectiveRisk !== 'low') {
    return {
      ...clarification(analysis, 'Please state the requested action explicitly because it is not classified as low risk.'),
      model: response.model,
      ollama_calls: ollamaCalls,
    };
  }

  return {
    status: 'ready',
    provider: 'ollama',
    model: response.model,
    ollama_calls: ollamaCalls,
    goal_analysis: {
      ...analysis,
      goal_type: analysis.goal_type,
      requested_services: services,
      risk_level: effectiveRisk,
      assumptions,
      inferred_action: !actionIsExplicit,
    },
    retrieval,
  };
}

export function validateSemanticAlignment(automation, analysis, cards = []) {
  const errors = [];
  const allowed = new Set(analysis?.requested_services || []);
  const actions = Array.isArray(automation?.actions) ? automation.actions : [];
  for (const [index, action] of actions.entries()) {
    const service = String(action?.action || action?.service || '');
    if (!allowed.has(service)) {
      errors.push(`actions[${index}] service ${service || '<missing>'} is not supported by the analyzed user intent.`);
    }
    if (analysis?.target_scope === 'specific') {
      const allowedTargets = new Set(cards
        .filter((card) => cardMatchesAnalysisTarget(card, analysis))
        .map((card) => card.entity_id));
      const targets = Array.isArray(action?.target?.entity_id) ? action.target.entity_id : [];
      if (!allowedTargets.size) {
        errors.push('The analyzed specific target does not match any available entity.');
      } else {
        for (const target of targets) {
          if (!allowedTargets.has(target)) {
            errors.push(`actions[${index}] target ${target} does not match the grounded target hints.`);
          }
        }
      }
    }
  }
  const triggers = Array.isArray(automation?.triggers) ? automation.triggers : [];
  if (analysis?.trigger_specified && triggers.length === 0) {
    errors.push('The analyzed user intent specified a trigger but the draft omitted it.');
  }
  if (!analysis?.trigger_specified && triggers.length > 0) {
    errors.push('The draft invented a trigger that was not present in the analyzed user intent.');
  }
  return { aligned: errors.length === 0, errors };
}

export function applyConservativeDraftPolicy(automation, analysis, cards = []) {
  const draft = typeof structuredClone === 'function'
    ? structuredClone(automation)
    : JSON.parse(JSON.stringify(automation));
  const notes = [];

  if (!analysis?.trigger_specified && Array.isArray(draft.triggers) && draft.triggers.length) {
    draft.triggers = [];
    notes.push('Removed a trigger that was not stated by the user.');
  }

  if (analysis?.inferred_action) {
    const allowedServices = new Set(analysis.requested_services || []);
    const cardsById = new Map(cards.map((card) => [card.entity_id, card]));
    draft.actions = (Array.isArray(draft.actions) ? draft.actions : []).filter((action) => {
      const service = text(action?.service || action?.action);
      if (!allowedServices.has(service)) return false;
      const targets = Array.isArray(action?.target?.entity_id) ? action.target.entity_id : [];
      const compatible = targets.every((entityId) => {
        const card = cardsById.get(entityId);
        return card?.supported_actions?.includes(service)
          && (analysis.target_scope !== 'specific' || cardMatchesAnalysisTarget(card, analysis));
      });
      return compatible;
    });
    notes.push('Restricted inferred actions to analyzed services and compatible grounded entities.');
  }

  return { automation: draft, notes };
}
