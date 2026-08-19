const ENTITY_ID_ARRAY_SCHEMA = {
  type: 'array',
  minItems: 1,
  items: { type: 'string' },
};

export const DRAFT_PROMPT_VERSION = '2026-08-18.1';

const MVP_AUTOMATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['triggers', 'conditions', 'actions'],
  properties: {
    alias: { type: 'string' },
    triggers: {
      type: 'array',
      minItems: 0,
      maxItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['platform', 'entity_id', 'to'],
        properties: {
          platform: { type: 'string', enum: ['state'] },
          entity_id: ENTITY_ID_ARRAY_SCHEMA,
          from: { type: 'string', enum: ['off'] },
          to: { type: 'string', enum: ['on'] },
        },
      },
    },
    conditions: {
      type: 'array',
      maxItems: 0,
    },
    actions: {
      type: 'array',
      minItems: 1,
      maxItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['service', 'target', 'data'],
        properties: {
          service: { type: 'string', enum: ['light.turn_on', 'light.turn_off'] },
          target: {
            type: 'object',
            additionalProperties: false,
            required: ['entity_id'],
            properties: { entity_id: ENTITY_ID_ARRAY_SCHEMA },
          },
          data: {
            type: 'object',
            additionalProperties: false,
          },
        },
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
    automation: MVP_AUTOMATION_SCHEMA,
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
3. Use only services listed in provided_context.services.
4. If required information is missing or candidates are materially ambiguous, do not guess; return needs_confirmation.
5. Return unsupported for requests outside the supported scope.
6. Never save, execute, or otherwise control Home Assistant.
7. Never use a friendly_name as an entity_id.
8. Never invent a device_id, area_id, attribute, or service_data value.
9. The supported scope is a state trigger, or a manual draft with no trigger, plus lighting actions listed in goal_analysis.requested_services.
10. conditions must be an empty array.
11. On success, automation must contain triggers, conditions, and actions arrays.
12. A trigger must have the form {"platform":"state","entity_id":["..."],"from":"off","to":"on"}.
13. An action must have the form {"service":"light.turn_on or light.turn_off","target":{"entity_id":["..."]},"data":{}}.
14. If goal_analysis.trigger_specified is false, triggers must be empty. Never invent a trigger.
15. If goal_analysis.inferred_action is true, follow its assumptions, select the smallest sufficient device set, and target only lights whose state is on for light.turn_off.
16. Never place entity_id at the top level of an action.
17. Write user-facing question and reason values in the language used by the user.`;

function text(value) {
  return String(value ?? '').trim();
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function compactCard(card) {
  return {
    entity_id: text(card.entity_id),
    friendly_name: text(card.friendly_name) || text(card.entity_id),
    domain: text(card.domain),
    state: card.state ?? null,
    device_class: text(card.device_class) || null,
    area: text(card.area) || null,
    capabilities: Array.isArray(card.capabilities) ? card.capabilities : [],
    supported_actions: Array.isArray(card.supported_actions) ? card.supported_actions : [],
  };
}

function relevanceScore(command, card) {
  const query = text(command).toLocaleLowerCase();
  const fields = [card.entity_id, card.friendly_name, card.area, card.device_class]
    .map((value) => text(value).toLocaleLowerCase())
    .filter(Boolean);
  let score = 0;
  for (const field of fields) {
    if (query.includes(field)) score += 10;
    for (const token of field.split(/[\s_.-]+/).filter((item) => item.length > 1)) {
      if (query.includes(token)) score += 1;
    }
  }
  return score;
}

export function selectOllamaEntityContext(command, cards, maxCards = 80) {
  const compatible = (Array.isArray(cards) ? cards : [])
    .filter((card) => card?.domain === 'binary_sensor' || card?.domain === 'light')
    .map((card) => ({ card: compactCard(card), score: relevanceScore(command, card) }));

  const perDomainLimit = Math.max(1, Math.floor(maxCards / 2));
  const selectDomain = (domain) => compatible
    .filter(({ card }) => card.domain === domain)
    .sort((a, b) => b.score - a.score || a.card.entity_id.localeCompare(b.card.entity_id))
    .slice(0, perDomainLimit)
    .map(({ card }) => card);

  return [
    ...selectDomain('binary_sensor'),
    ...selectDomain('light'),
  ].slice(0, maxCards);
}

export function buildOllamaMessages({ command, entity_cards, selections, goal_analysis, repair }) {
  const goalAnalysis = goal_analysis || null;
  const requestedServices = Array.isArray(goalAnalysis?.requested_services)
    ? goalAnalysis.requested_services
    : ['light.turn_on'];
  const context = {
    request: text(command),
    selected_entities: selections || {},
    goal_analysis: goalAnalysis,
    provided_context: {
      entities: entity_cards,
      services: requestedServices,
      supported_trigger_platforms: ['state'],
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
  const maxCards = positiveInteger(env.LLM_MAX_ENTITY_CARDS, 32);
  const entityCards = selectOllamaEntityContext(
    payload.command,
    payload.entity_cards,
    maxCards,
  );
  const messages = buildOllamaMessages({
    command: payload.command,
    entity_cards: entityCards,
    selections: payload.selections,
    goal_analysis: payload.goal_analysis,
    repair: options.repair,
  });

  const response = await requestOllamaStructured({
    schema: OLLAMA_DRAFT_RESPONSE_SCHEMA,
    messages,
  }, options);
  return { ...response, entity_cards: entityCards };
}

export async function requestOllamaStructured({ schema, messages }, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const baseUrl = text(env.OLLAMA_BASE_URL) || 'http://127.0.0.1:11434';
  const model = text(env.OLLAMA_MODEL) || 'qwen3:4b';
  const timeoutMs = positiveInteger(env.LLM_REQUEST_TIMEOUT_MS, 120000);
  const keepAlive = text(env.OLLAMA_KEEP_ALIVE) || '30m';

  const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
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
