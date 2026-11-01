import { rankEntitiesLexically, retrieveEntityContext } from './entity_retriever.mjs';
import { scopeCapabilityContext } from './capability_registry.mjs';

const ENTITY_ID_ARRAY_SCHEMA = {
  type: 'array',
  minItems: 1,
  items: { type: 'string' },
};

export const DRAFT_PROMPT_VERSION = '2026-08-25.1';

const AUTOMATION_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['triggers', 'conditions', 'actions'],
  properties: {
    alias: { type: 'string' },
    triggers: {
      type: 'array',
      minItems: 0,
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: true,
      },
    },
    conditions: {
      type: 'array',
      maxItems: 8,
      items: {
        anyOf: [
          { type: 'object', additionalProperties: true },
          { type: 'string' },
        ],
      },
    },
    actions: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: true,
      },
    },
  },
};

export const OLLAMA_DRAFT_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: {
    status: {
      type: 'string',
      enum: ['success', 'needs_confirmation', 'unsupported'],
    },
    automation: AUTOMATION_PLAN_SCHEMA,
    role: {
      type: 'string',
      enum: ['trigger', 'action'],
    },
    question: { type: 'string' },
    candidate_entity_ids: {
      type: 'array',
      minItems: 1,
      items: { type: 'string' },
      maxItems: 8,
    },
    reason: { type: 'string' },
  },
  allOf: [
    {
      if: { properties: { status: { const: 'success' } }, required: ['status'] },
      then: { required: ['automation'] },
    },
    {
      if: { properties: { status: { const: 'needs_confirmation' } }, required: ['status'] },
      then: { required: ['role', 'question', 'candidate_entity_ids'] },
    },
    {
      if: { properties: { status: { const: 'unsupported' } }, required: ['status'] },
      then: { required: ['reason'] },
    },
  ],
};

const SYSTEM_PROMPT = `You are a constrained translator that produces a Home Assistant automation draft.

Use the user's natural-language request and the entity candidates supplied by the system. Return exactly one object that conforms to the provided JSON Schema.

Rules:
1. Return no explanation, Markdown, or code fences.
2. Copy every entity_id exactly from provided_context.entities.
3. Use only service IDs listed in provided_context.capabilities.services.
4. If required information is missing or candidates are materially ambiguous, do not guess; return needs_confirmation.
5. Return unsupported for requests outside the supported scope.
6. Never save, execute, or otherwise control Home Assistant.
7. Never use a friendly_name as an entity_id.
8. Never invent a device_id, area_id, attribute, or service_data value.
9. The supported scope is exactly provided_context.capabilities. Do not use a trigger kind, condition kind, action structure, or service absent from that object.
10. Generate only structures marked as native visual capabilities. Never assume that a raw-preserved structure is visually editable.
11. On success, automation must contain triggers, conditions, and actions arrays.
12. Use canonical Home Assistant IR spellings: platform for triggers, condition for conditions, and service for service-call actions.
13. Every entity_id value must be a non-empty array, including trigger entity_id and action target.entity_id.
14. If goal_analysis.trigger_specified is false, triggers must be empty. Never invent a trigger.
15. If goal_analysis.inferred_action is true, follow its assumptions and select the smallest sufficient compatible entity set.
16. Never place entity_id at the top level of a service action; use target.entity_id.
17. Write user-facing question and reason values in the language used by the user.`;

function text(value) {
  return String(value ?? '').trim();
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function optionalBoolean(value) {
  const normalized = text(value).toLocaleLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return undefined;
}

export function selectOllamaEntityContext(command, cards, maxCards = 80) {
  return rankEntitiesLexically(command, cards).slice(0, maxCards).map(({ card }) => card);
}

export function buildOllamaMessages({ command, entity_cards, selections, goal_analysis, capability_context, repair }) {
  const goalAnalysis = goal_analysis || null;
  const requestedServices = Array.isArray(goalAnalysis?.requested_services)
    ? goalAnalysis.requested_services
    : [...new Set((entity_cards || []).flatMap((card) => card.supported_actions || []))];
  const scopedCapabilities = capability_context
    ? scopeCapabilityContext(capability_context, entity_cards)
    : null;
  if (scopedCapabilities && requestedServices.length) {
    const requestedSet = new Set(requestedServices);
    scopedCapabilities.services = scopedCapabilities.services.filter((service) => (
      requestedSet.has(typeof service === 'string' ? service : service.id)
    ));
  }
  const context = {
    request: text(command),
    selected_entities: selections || {},
    goal_analysis: goalAnalysis,
    provided_context: {
      entities: entity_cards,
      capabilities: scopedCapabilities || {
        services: requestedServices.map((id) => ({ id })),
        trigger_kinds: ['state'],
        condition_kinds: [],
        action_structures: ['service'],
      },
    },
  };
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify(context) },
  ];

  if (repair) {
    messages.push({
      role: 'user',
      content: `The previous output failed validation. Return only a corrected JSON object that resolves every error below: ${repair}`,
    });
  }
  return messages;
}

export async function requestOllamaDraft(payload, options = {}) {
  const env = options.env || process.env;
  const maxCards = positiveInteger(env.LLM_MAX_ENTITY_CARDS, 16);
  const reusedCards = Array.isArray(payload.retrieved_entity_cards)
    ? payload.retrieved_entity_cards.slice(0, maxCards)
    : null;
  const retrieval = reusedCards
    ? { cards: reusedCards, method: 'reused_goal_context', fallback: false }
    : await retrieveEntityContext(payload.command, payload.entity_cards, {
      ...options,
      maxCards,
    });
  const entityCards = retrieval.cards;
  const messages = buildOllamaMessages({
    command: payload.command,
    entity_cards: entityCards,
    selections: payload.selections,
    goal_analysis: payload.goal_analysis,
    capability_context: payload.capability_context,
    repair: options.repair,
  });

  const response = await requestOllamaStructured({
    schema: OLLAMA_DRAFT_RESPONSE_SCHEMA,
    messages,
  }, options);
  return { ...response, entity_cards: entityCards, retrieval };
}

export async function requestOllamaStructured({ schema, messages }, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const baseUrl = text(env.OLLAMA_BASE_URL) || 'http://127.0.0.1:11434';
  const model = text(env.OLLAMA_MODEL) || 'qwen3:4b';
  const timeoutMs = positiveInteger(env.LLM_REQUEST_TIMEOUT_MS, 120000);
  const keepAlive = text(env.OLLAMA_KEEP_ALIVE) || '30m';
  const think = optionalBoolean(env.OLLAMA_THINK);

  const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      ...(think === undefined ? {} : { think }),
      keep_alive: keepAlive,
      format: schema,
      messages,
      options: {
        temperature: 0,
        seed: positiveInteger(env.OLLAMA_SEED, 42),
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const detail = text(await response.text()).slice(0, 500);
    throw new Error(`Ollama request failed: ${response.status}${detail ? ` ${detail}` : ''}`);
  }

  const body = await response.json();
  const content = body?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Ollama returned an empty structured response.');
  }

  try {
    const milliseconds = (value) => Number.isFinite(Number(value))
      ? Math.round(Number(value) / 1_000_000)
      : null;
    const performance = {
      total_ms: milliseconds(body.total_duration),
      load_ms: milliseconds(body.load_duration),
      prompt_eval_ms: milliseconds(body.prompt_eval_duration),
      generation_ms: milliseconds(body.eval_duration),
      prompt_tokens: Number.isFinite(Number(body.prompt_eval_count))
        ? Number(body.prompt_eval_count)
        : null,
      generated_tokens: Number.isFinite(Number(body.eval_count))
        ? Number(body.eval_count)
        : null,
    };
    return {
      output: JSON.parse(content),
      model: text(body.model) || model,
      performance,
    };
  } catch {
    throw new Error('Ollama returned invalid JSON.');
  }
}
