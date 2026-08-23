import {
  requestOllamaStructured,
  selectOllamaEntityContext,
} from './ollama_automation_provider.mjs';
import { validateJsonSchema } from './json_schema_validator.mjs';

export const GOAL_PROMPT_VERSION = '2026-08-16.2';

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
      enum: ['lighting', 'sleep_preparation', 'security', 'climate', 'media', 'other'],
    },
    home_supports_goal: { type: 'boolean' },
    trigger_specified: { type: 'boolean' },
    trigger_kind: { type: 'string', enum: ['state', 'time', 'event', 'none', 'unknown'] },
    primary_service: {
      type: 'string',
      enum: ['light.turn_on', 'light.turn_off', 'none'],
    },
    requested_services: {
      type: 'array',
      items: { type: 'string', enum: ['light.turn_on', 'light.turn_off'] },
    },
    action_source: { type: 'string', enum: ['explicit', 'inferred', 'unknown'] },
    target_scope: { type: 'string', enum: ['specific', 'all', 'unspecified'] },
    target_hints: { type: 'array', items: { type: 'string' } },
    target_entity_ids: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    risk_level: { type: 'string', enum: ['low', 'high'] },
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
1. This interface creates automation drafts. Even if the user phrases the request as an immediate command, classify it as goal_type=automation_creation. Never execute it.
2. If no trigger is stated, do not ask for one. Set trigger_specified=false and trigger_kind=none, and plan a manually runnable draft.
3. For a low-risk, reversible lighting draft, you may infer the smallest common-sense plan from an abstract goal. Record every inference in assumptions.
4. For example, sleep preparation may suggest the minimal draft of turning off currently-on general lights. Do not turn on new lights or add unstated high-risk actions.
5. Set action_source=explicit only when the conversation directly states the action, and copy the exact action wording into evidence.action_phrase. Set action_source=inferred only when the action is inferred, leave evidence.action_phrase empty, and state the rationale in assumptions.
6. The supported planning scope is a state trigger, a manually runnable draft, and light.turn_on/light.turn_off. Return unsupported for other capabilities.
7. Assess feasibility only from the provided entities and supported_actions.
8. Every non-empty evidence value and every target_hints item must be an exact contiguous substring of conversation. Use an empty string when no such evidence exists.
9. Ask at most one question, and only when the uncertainty would materially change the plan.
10. Return ready for a low-risk draft. For inferred security, lock, or other high-risk actions, return needs_clarification or unsupported.
11. Choose the smallest sufficient device set. For an inferred light.turn_off action, prefer lights whose current state is on. If none are on, explicitly record an assumption before selecting all supported lights for a reusable draft.
12. goal_category=sleep_preparation covers goals such as preparing for bed or sleep that may involve multiple device actions.
13. primary_service is the single most important action. When status=ready, it must not be none and the same value must appear in requested_services.
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

const EXPLICIT_SERVICE_PATTERNS = [
  {
    service: 'light.turn_on',
    pattern: /(?:켜\s*(?:줘|줘요|주세요|라|기)|turn\s+on|switch\s+on)/giu,
  },
  {
    service: 'light.turn_off',
    pattern: /(?:꺼\s*(?:줘|줘요|주세요|라|기)|끄\s*(?:기|세요|라고|도록|자)?|turn\s+off|switch\s+off)/giu,
  },
];

const SLEEP_PREPARATION_RE = /(?:잠들|잠자|취침|수면|잘\s*준비|자러|bedtime|sleep|go(?:ing)?\s+to\s+bed|prepar(?:e|ing)\s+for\s+bed)/iu;

function detectExplicitService(source) {
  const matches = [];
  for (const { service, pattern } of EXPLICIT_SERVICE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text(source).matchAll(pattern)) {
      matches.push({ service, phrase: match[0], index: match.index || 0 });
    }
  }
  return matches.sort((a, b) => b.index - a.index)[0] || null;
}

function detectExplicitStateTrigger(source, cards = []) {
  const value = text(source);
  const koreanConditional = value.match(/^(.+?(?:면|때|경우|후))(?:\s|,)/u);
  const englishConditional = value.match(
    /^\s*((?:when|if|after|once)\b.+?)(?:,|\bthen\b)/iu,
  );
  const phrase = text(koreanConditional?.[1] || englishConditional?.[1]);
  if (!phrase) return null;

  const normalizedPhrase = normalized(phrase);
  const referencesKnownEntity = cards.some((card) => [
    card?.entity_id,
    card?.friendly_name,
  ].map(normalized).filter(Boolean).some(
    (candidate) => normalizedPhrase.includes(candidate) || candidate.includes(normalizedPhrase),
  ));
  return referencesKnownEntity ? { kind: 'state', phrase } : null;
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
  const explicitService = detectExplicitService(sourceText);
  const explicitTrigger = detectExplicitStateTrigger(sourceText, cards);
  if (
    explicitService
    && normalizedAnalysis.primary_service === explicitService.service
    && Array.isArray(normalizedAnalysis.requested_services)
    && normalizedAnalysis.requested_services.includes(explicitService.service)
  ) {
    normalizedAnalysis.action_source = 'explicit';
    normalizedAnalysis.evidence = {
      ...(normalizedAnalysis.evidence || {}),
      action_phrase: explicitService.phrase,
    };
  }
  if (normalizedAnalysis.trigger_specified === false && normalizedAnalysis.evidence) {
    normalizedAnalysis.evidence.trigger_phrase = '';
  }
  if (normalizedAnalysis.status === 'ready' && explicitTrigger) {
    normalizedAnalysis.trigger_specified = true;
    normalizedAnalysis.trigger_kind = explicitTrigger.kind;
    normalizedAnalysis.evidence = {
      ...(normalizedAnalysis.evidence || {}),
      trigger_phrase: explicitTrigger.phrase,
    };
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
  if (
    normalizedAnalysis.target_entity_ids.length
    && explicitService
    && text(normalizedAnalysis.evidence?.target_phrase).includes(explicitService.phrase)
  ) {
    normalizedAnalysis.evidence.target_phrase = '';
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
    && !explicitService;
  const unsupportedInference = normalizedAnalysis.action_source === 'inferred'
    && (
      normalizedAnalysis.goal_category !== 'sleep_preparation'
      || !SLEEP_PREPARATION_RE.test(sourceText)
    );
  if (
    normalizedAnalysis.status === 'ready'
    && (unsupportedExplicitClaim || unsupportedInference)
  ) {
    const korean = /[가-힣]/u.test(sourceText);
    normalizedAnalysis.status = 'needs_clarification';
    normalizedAnalysis.primary_service = 'none';
    normalizedAnalysis.requested_services = [];
    normalizedAnalysis.action_source = 'unknown';
    normalizedAnalysis.target_hints = [];
    normalizedAnalysis.target_entity_ids = [];
    normalizedAnalysis.questions = [korean
      ? '조명을 켤까요, 끌까요?'
      : 'Should the light turn on or off?'];
    normalizedAnalysis.reason = korean
      ? '요청 원문에서 실행할 조명 동작의 근거를 확인할 수 없다.'
      : 'The user wording does not provide evidence for a specific lighting action.';
  }

  if (
    normalizedAnalysis.status === 'ready'
    && ['climate', 'security', 'media'].includes(normalizedAnalysis.goal_category)
  ) {
    const korean = /[가-힣]/u.test(sourceText);
    normalizedAnalysis.status = 'unsupported';
    normalizedAnalysis.home_supports_goal = false;
    normalizedAnalysis.primary_service = 'none';
    normalizedAnalysis.requested_services = [];
    normalizedAnalysis.action_source = 'unknown';
    normalizedAnalysis.target_hints = [];
    normalizedAnalysis.target_entity_ids = [];
    normalizedAnalysis.questions = [];
    normalizedAnalysis.reason = korean
      ? '현재 자동화 초안은 조명 켜기와 끄기만 지원한다.'
      : 'The current automation draft supports only turning lights on or off.';
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
    if (analysis.trigger_kind === 'state' && !phraseAppears(evidence.trigger_phrase, source)) {
      errors.push('A state trigger requires exact trigger evidence from the user conversation.');
    }
    if (
      analysis.target_scope === 'specific'
      && !(analysis.target_hints || []).length
      && !(analysis.target_entity_ids || []).length
    ) {
      errors.push('A specific target requires a grounded target hint or entity ID.');
    }
  }

  const explicitService = detectExplicitService(source);
  if (analysis.status === 'ready' && explicitService) {
    if (analysis.primary_service !== explicitService.service) {
      errors.push(`Explicit user wording indicates ${explicitService.service}, not ${analysis.primary_service}.`);
    }
    if (analysis.action_source !== 'explicit') {
      errors.push('Explicit service wording cannot be classified as an inferred action.');
    }
  }

  return { valid: errors.length === 0, errors, explicit_service: explicitService };
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
    : 32;
  const entityCards = selectOllamaEntityContext(sourceText, payload.entity_cards, maxCards);
  const messages = [
    { role: 'system', content: GOAL_ANALYZER_PROMPT },
    {
      role: 'user',
      content: JSON.stringify({
        conversation: Array.isArray(payload.conversation) && payload.conversation.length
          ? payload.conversation
          : [{ role: 'user', content: text(payload.command) }],
        home_context: {
          entities: entityCards,
          supported_trigger_kinds: ['state'],
          supported_services: ['light.turn_on', 'light.turn_off'],
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
  if (analysis.trigger_kind !== 'state' && analysis.trigger_kind !== 'none') {
    const question = analysis.trigger_kind === 'time'
      ? 'Time triggers are not supported yet. Should I create a manually runnable draft instead?'
      : 'Should I use a supported state trigger or create a manually runnable draft?';
    return { ...clarification(analysis, question), model: response.model, ollama_calls: ollamaCalls };
  }
  const services = Array.isArray(analysis.requested_services)
    ? [...new Set(analysis.requested_services.map(text).filter(Boolean))]
    : [];
  if (!services.length) {
    return {
      ...clarification(analysis, 'Should the lights turn on or off for this goal?'),
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
      ...clarification(analysis, 'Which lighting action should replace the inferred action?'),
      model: response.model,
      ollama_calls: ollamaCalls,
    };
  }
  if (analysis.trigger_kind === 'state' && !phraseAppears(analysis.evidence?.trigger_phrase, sourceText)) {
    return { ...clarification(analysis, 'Which entity state change should be used as the trigger?'), model: response.model, ollama_calls: ollamaCalls };
  }
  const supported = services.every((service) => entityCards.some(
    (card) => Array.isArray(card.supported_actions) && card.supported_actions.includes(service),
  ));
  if (!analysis.home_supports_goal || !supported) {
    return {
      status: 'unsupported',
      provider: 'ollama',
      model: response.model,
      reason: 'This goal cannot be planned with the available Home Assistant entities and supported services.',
      goal_analysis: analysis,
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
      goal_type: 'automation_creation',
      requested_services: services,
      assumptions,
      inferred_action: !actionIsExplicit,
    },
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
    const services = [...new Set(analysis.requested_services || [])];
    const inferredActions = [];
    for (const service of services) {
      if (service !== 'light.turn_off') continue;
      let eligibleTargets = cards
        .filter((card) => card?.domain === 'light')
        .filter((card) => Array.isArray(card.supported_actions) && card.supported_actions.includes(service))
        .filter((card) => Boolean(card.entity_id));
      if (analysis.target_scope === 'specific') {
        eligibleTargets = eligibleTargets.filter(
          (card) => cardMatchesAnalysisTarget(card, analysis),
        );
      }
      const currentlyOnTargets = eligibleTargets.filter((card) => card.state === 'on');
      const targets = (currentlyOnTargets.length ? currentlyOnTargets : eligibleTargets)
        .map((card) => card.entity_id);
      if (!targets.length) continue;
      inferredActions.push({
        service,
        target: { entity_id: targets },
        data: {},
      });
      notes.push(currentlyOnTargets.length
        ? `Limited the inferred light-off action to ${targets.length} currently-on light(s).`
        : `No lights are currently on; assumed all ${targets.length} supported light(s) for a reusable draft.`);
    }
    draft.actions = inferredActions;
  }

  return { automation: draft, notes };
}
