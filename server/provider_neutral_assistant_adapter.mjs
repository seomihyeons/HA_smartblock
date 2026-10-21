const DEFAULT_BASE_URL = 'http://127.0.0.1:8792';
const SELECTABLE_PROVIDERS = new Set(['chatgpt', 'claude', 'gemini', 'grok', 'ollama']);

export class ProviderNeutralAssistantError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = 'ProviderNeutralAssistantError';
    this.statusCode = statusCode;
  }
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function publicFailure(response, fallback) {
  const message = String(response?.reason || response?.error || fallback).trim();
  return message || fallback;
}

/**
 * Local-only adapter between the Node/HA boundary and the private Python LLM
 * service. It never receives provider credentials and never invokes HA control.
 */
export function createProviderNeutralAssistantAdapter({
  env = process.env,
  baseUrl = env.LLM_ASSISTANT_API_URL || DEFAULT_BASE_URL,
  timeoutMs = positiveInteger(env.LLM_ASSISTANT_TIMEOUT_MS, 120000),
  fetchImpl = fetch,
} = {}) {
  const origin = String(baseUrl).replace(/\/$/, '');
  const endpoint = `${origin}/v1/assistant`;
  const responseEndpoint = `${origin}/v1/assistant/respond`;

  const requestLocal = async (url, init = {}) => {
    let response;
    try {
      response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      const reason = error?.name === 'TimeoutError'
        ? 'The provider-neutral LLM assistant timed out.'
        : 'The provider-neutral LLM assistant is unavailable.';
      throw new ProviderNeutralAssistantError(reason, 503);
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ProviderNeutralAssistantError(publicFailure(payload, `LLM assistant request failed: ${response.status}`), response.status);
    }
    return payload;
  };

  return {
    async getProviders() {
      const payload = await requestLocal(`${origin}/v1/providers`);
      const providers = Array.isArray(payload?.providers) ? payload.providers : [];
      return {
        providers: providers
          .filter((provider) => SELECTABLE_PROVIDERS.has(String(provider?.id || '').toLowerCase()))
          .map((provider) => ({
            id: String(provider.id).toLowerCase(),
            label: String(provider.label || provider.id),
            configured: provider.configured === true,
          })),
        default_provider: SELECTABLE_PROVIDERS.has(String(payload?.default_provider || '').toLowerCase())
          ? String(payload.default_provider).toLowerCase()
          : 'chatgpt',
      };
    },

    async retrieveFastembed({ query, entityCards }) {
      const payload = await requestLocal(`${origin}/v1/retrieval/fastembed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: String(query || ''),
          entity_cards: Array.isArray(entityCards) ? entityCards : [],
        }),
      });
      if (!Array.isArray(payload?.ranking)) {
        throw new ProviderNeutralAssistantError('FastEmbed retrieval returned an invalid result.', 502);
      }
      return payload;
    },

    async createResponse({ command, provider, responseLanguage = 'en', toolResult }) {
      const requestedProvider = String(provider || env.LLM_ASSISTANT_PROVIDER || '').trim().toLowerCase();
      if (requestedProvider && !SELECTABLE_PROVIDERS.has(requestedProvider)) {
        throw new ProviderNeutralAssistantError('Unsupported provider.', 400);
      }
      const payload = await requestLocal(responseEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: String(command || ''),
          provider: requestedProvider || undefined,
          response_language: String(responseLanguage || 'en'),
          tool_result: toolResult && typeof toolResult === 'object' ? toolResult : {},
          max_tokens: 320,
        }),
      });
      return {
        response: String(payload?.response || '').trim(),
        provider: payload?.metrics?.provider || requestedProvider || 'configured-default',
        model: payload?.metrics?.model || 'configured-default',
        latency_ms: payload?.metrics?.latency_ms ?? null,
      };
    },

    async createDraft({ command, conversation, provider, entityCards, capabilityContext, retrieval, entityResolution, slots, interactionContext, informationInventory }) {
      const requestedProvider = String(provider || env.LLM_ASSISTANT_PROVIDER || '').trim().toLowerCase();
      if (requestedProvider && !SELECTABLE_PROVIDERS.has(requestedProvider)) {
        throw new ProviderNeutralAssistantError('Unsupported provider.', 400);
      }
      const payload = await requestLocal(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command,
          conversation: Array.isArray(conversation) ? conversation : [],
          provider: requestedProvider || undefined,
          max_tokens: positiveInteger(env.LLM_ASSISTANT_MAX_TOKENS, 1200),
          home_context: {
            entity_cards: Array.isArray(entityCards) ? entityCards : [],
            capabilities: capabilityContext || { services: [] },
            retrieval: retrieval && typeof retrieval === 'object' ? {
              method: String(retrieval.method || 'lexical'),
              fallback: retrieval.fallback === true,
              embedding_model: retrieval.embedding_model ? String(retrieval.embedding_model) : null,
              candidate_entity_ids: Array.isArray(retrieval.candidate_entity_ids)
                ? retrieval.candidate_entity_ids.map(String)
                : [],
              ranking: Array.isArray(retrieval.ranking)
                ? retrieval.ranking.map((entry) => ({
                  entity_id: String(entry?.entity_id || ''),
                  rank: Number(entry?.rank) || null,
                })).filter((entry) => entry.entity_id)
                : [],
            } : null,
            entity_resolution: Array.isArray(entityResolution) ? entityResolution : [],
            slots: slots && typeof slots === 'object' && !Array.isArray(slots) ? slots : {},
            interaction_context: interactionContext && typeof interactionContext === 'object'
              ? interactionContext : { last_confirmed_target: null },
            information_inventory: Array.isArray(informationInventory)
              ? informationInventory.map((item) => ({
                domain: String(item?.domain || ''),
                count: Number(item?.count) || 0,
              })).filter((item) => item.domain)
              : [],
          },
        }),
      });

      const intent = String(payload?.intent || 'automation').toLowerCase();
      return {
        ...payload,
        intent,
        provider: payload?.metrics?.provider || provider || env.LLM_ASSISTANT_PROVIDER || 'configured-default',
        model: payload?.metrics?.model || 'configured-default',
        pipeline: {
          mode: 'provider_neutral',
          attempts: payload?.metrics?.attempts || 0,
          timings_ms: { total: payload?.metrics?.total_latency_ms || null },
        },
        validation: {
          ...(payload?.validation || {}),
          // Python validates a plan; the Node/HA router owns the final
          // resolution outcome and UI-facing validation flags.
          schema_valid: false,
          grounded: false,
          blockly_supported: false,
        },
      };
    },
  };
}
