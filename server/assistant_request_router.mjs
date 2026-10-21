import { normalizeAssistantPlan } from './assistant_contract.mjs';
const text = (value) => String(value ?? '').trim();

const MESSAGE_TEMPLATES = {
  ko: {
    select_entity: '사용할 기기를 선택해 주세요.',
    model_generation_invalid: '요청을 처리하는 중 모델 응답을 검증하지 못했습니다.',
    other_unsupported: '현재 스마트홈 Assistant가 지원하는 요청이 아닙니다.',
    routine_missing: '루틴을 만들기 위해 필요한 정보를 더 알려 주세요.',
    routine_unsupported: '요청하신 루틴 기능은 현재 지원하지 않습니다.',
    entity_not_found: '요청하신 기기를 찾지 못했습니다.',
    unsupported_capability: '요청하신 기능은 현재 지원하지 않습니다.',
    invalid_request: '요청을 처리하려면 필요한 정보를 더 알려 주세요.',
    information_retrieved: '현재 Home Assistant 정보를 조회했습니다.',
    control_missing: '어떤 기기를 어떻게 제어할까요?',
    control_ready: '실행 대상과 서비스를 확인한 뒤 Execute를 눌러 주세요.',
    control_completed: '요청한 동작을 완료했습니다.',
    automation_generation_invalid: '자동화 초안을 검증하지 못했습니다.',
    automation_ready: '검증된 자동화 초안을 만들었습니다.',
    request_not_understood: '요청을 이해하지 못했습니다.',
  },
  en: {
    select_entity: 'Please select the device to use.',
    model_generation_invalid: 'The model response could not be validated.',
    other_unsupported: 'This request is outside the supported smart-home scope.',
    routine_missing: 'Please provide the information needed to create this routine.',
    routine_unsupported: 'The requested routine capability is not currently supported.',
    entity_not_found: 'I could not find the requested device.',
    unsupported_capability: 'The requested capability is not supported.',
    invalid_request: 'Please provide the information needed to process this request.',
    information_retrieved: 'Current Home Assistant information was retrieved.',
    control_missing: 'Which device should I control, and how?',
    control_ready: 'Review the exact targets, service and risk, then press Execute.',
    control_completed: 'The requested action was completed.',
    automation_generation_invalid: 'The automation draft could not be validated.',
    automation_ready: 'A validated automation draft was created.',
    request_not_understood: 'I could not understand this request.',
  },
};

function responseLanguage(payload = {}) {
  return String(payload.response_language || 'en').toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

function message(key, language) {
  return MESSAGE_TEMPLATES[language]?.[key] || MESSAGE_TEMPLATES.en[key] || key;
}

function normalizedText(value) {
  return text(value).normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase();
}

// A model may suggest the user-facing reference, but it is never authoritative
// metadata. Only echo it if it can be traced to the original user request.
function verifiedUserReference(reference, command) {
  const candidate = text(reference);
  if (!candidate || candidate.length > 120) return '';
  return normalizedText(command).includes(normalizedText(candidate)) ? candidate : '';
}

function koreanTopicParticle(reference) {
  const last = [...text(reference)].at(-1);
  if (!last) return '';
  const code = last.codePointAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return '';
  return (code - 0xAC00) % 28 === 0 ? '는' : '은';
}

function localizedState(state, language) {
  const value = text(state).toLowerCase();
  if (language !== 'ko') return value || 'unknown';
  return {
    on: '켜져 있습니다',
    off: '꺼져 있습니다',
    unavailable: '사용할 수 없습니다',
    unknown: '알 수 없습니다',
  }[value] || `${text(state)} 상태입니다`;
}

function informationMessage(information, plan, command, language) {
  const reference = verifiedUserReference(plan?.user_reference, command)
    || text(information?.entity?.display_name || information?.entity?.entity_id);
  const aggregate = information?.aggregate;
  if (aggregate?.kind === 'count') {
    const count = Number(aggregate.count) || 0;
    if (language === 'ko') {
      return reference
        ? `현재 등록된 ${reference} 기기는 ${count}개입니다.`
        : `현재 조건에 맞는 기기는 ${count}개입니다.`;
    }
    return `There are ${count} matching ${reference || aggregate.domain || 'Home Assistant'} entities.`;
  }
  if (information?.kind === 'collection') {
    const entities = Array.isArray(information.entities) ? information.entities : [];
    const names = entities.map((entity) => text(entity.display_name || entity.entity_id)).filter(Boolean);
    if (language === 'ko') {
      return names.length
        ? `요청하신 기기 목록입니다: ${names.join(', ')}.`
        : '조건에 맞는 기기가 없습니다.';
    }
    return names.length ? `Matching devices: ${names.join(', ')}.` : 'No matching devices were found.';
  }
  if (information?.property && information.property !== 'state') {
    const value = information.entity?.value;
    const unit = information.entity?.unit || '';
    return `${reference} · ${information.property}: ${value == null ? (language === 'ko' ? '알 수 없음' : 'unknown') : typeof value === 'object' ? JSON.stringify(value) : value}${unit ? ' ' + unit : ''}`;
  }
  const state = localizedState(information?.entity?.state, language);
  if (language === 'ko') {
    return /[가-힣]/.test(reference)
      ? `${reference}${koreanTopicParticle(reference)} 현재 ${state}.`
      : `${reference}: ${state}`;
  }
  return `${reference} is currently ${state}.`;
}

function resolution(status, failureReason = null) {
  return { status, failure_reason: failureReason };
}

function candidateDisplay(candidate = {}) {
  return {
    candidate_id: text(candidate.entity_id),
    entity_id: text(candidate.entity_id),
    display_name: text(candidate.display_name || candidate.name || candidate.friendly_name || candidate.entity_id),
    display_name_source: text(candidate.display_name_source || 'friendly_name'),
    area: candidate.area || null,
    domain: candidate.domain || null,
    state: candidate.state ?? null,
  };
}

function failed(intent, failureReason, messageKey, language, extra = {}) {
  return {
    intent,
    resolution: resolution('failed', failureReason),
    message_key: messageKey,
    message: message(messageKey, language),
    ...extra,
  };
}

async function narrate(createResponse, {
  payload, language, toolResult, fallback,
}) {
  if (typeof createResponse !== 'function') return fallback;
  try {
    const generated = await createResponse({
      command: payload.command,
      provider: payload.provider,
      responseLanguage: language,
      toolResult,
    });
    return text(generated?.response) || fallback;
  } catch {
    // The planning/execution outcome remains valid if response realization is
    // unavailable.  Templates are an availability fallback, not the normal
    // conversational path.
    return fallback;
  }
}

async function narratedFailure(createResponse, {
  payload, language, intent, failureReason, messageKey, extra = {},
}) {
  const fallback = message(messageKey, language);
  return {
    ...failed(intent, failureReason, messageKey, language, extra),
    message: await narrate(createResponse, {
      payload, language, fallback,
      toolResult: {
        outcome: 'failed', intent, failure_reason: failureReason,
        missing_fields: Array.isArray(extra.missing_fields) ? extra.missing_fields : [],
      },
    }),
  };
}

function publicControlExecution(execution = {}) {
  return {
    status: text(execution.status),
    service: text(execution.service),
    entity: execution.entity || null,
    entities: Array.isArray(execution.entities) ? execution.entities : [],
    target_count: Number(execution.target_count) || 0,
    request_status: execution.request_status,
    verification: execution.verification,
  };
}

function validationFailure(intent, result, language) {
  const errors = Array.isArray(result?.validation?.errors) ? result.validation.errors : [];
  const detail = errors.join(' ').toLowerCase();
  if (detail.includes('outside home assistant context') || detail.includes('omitted a server-resolved entity')) {
    return failed(intent, 'entity_not_found', 'entity_not_found', language, { validation: result.validation });
  }
  if (detail.includes('service') || detail.includes('capability')) {
    return failed(intent, 'unsupported_capability', 'unsupported_capability', language, { validation: result.validation });
  }
  if (detail.includes('must include') || detail.includes('requires a grounded target')) {
    return failed(intent, 'invalid_request', 'invalid_request', language, { validation: result.validation });
  }
  return null;
}

function contextualTargetMismatch(plan, payload) {
  const target = plan?.target && typeof plan.target === 'object' ? plan.target : {};
  if (text(target.context_source) !== 'last_confirmed_target') return false;
  const expectedId = text(payload?.interaction_context?.last_confirmed_target?.entity_id);
  const evidence = text(target.context_evidence);
  return !expectedId
    || !evidence
    || !normalizedText(payload?.command).includes(normalizedText(evidence))
    || text(target.selector) !== 'entity'
    || text(target.entity_id) !== expectedId;
}

function collectionScopeMismatch(plan, command) {
  const target = plan?.target && typeof plan.target === 'object' ? plan.target : {};
  if (text(target.selector) !== 'entity_filter') return false;
  if (text(target.scope) !== 'collection') return true;
  const evidence = text(target.scope_reference);
  return !evidence || !normalizedText(command).includes(normalizedText(evidence));
}

function groundingCandidates(assessment) {
  return (Array.isArray(assessment?.candidates) ? assessment.candidates : [])
    .map(candidateDisplay)
    .filter((candidate) => candidate.entity_id);
}

/**
 * Converts a single provider-neutral intent/plan response into a user-facing
 * resolution.  LLMs never select success/no-match/unsupported; this router
 * owns those values after checking the live Home Assistant boundary.
 */
export function createAssistantRequestRouter({
  createDraft, previewControl, executeControl, queryInformation, createResponse,
}) {
  if (
    typeof createDraft !== 'function'
    || typeof previewControl !== 'function'
    || typeof executeControl !== 'function'
    || typeof queryInformation !== 'function'
  ) {
    throw new TypeError('Assistant router requires draft, control, and information handlers');
  }

  return {
    async execute(payload = {}) {
      const execution = await executeControl(payload);
      const language = responseLanguage(payload);
      const confirmed = execution.verification?.status === 'confirmed';
      const fallback = language === 'ko'
        ? (confirmed ? 'Home Assistant가 요청을 수락했고 예상 상태가 관찰되었습니다.' : 'Home Assistant가 요청을 수락했습니다. 상태 변화는 확인되지 않았습니다.')
        : (confirmed ? 'Home Assistant accepted the request and the expected state was observed.' : 'Home Assistant accepted the request; a state change was not confirmed.');
      return { intent: 'control', resolution: resolution('success'),
        message: await narrate(createResponse, { payload, language, fallback, toolResult: { outcome: 'accepted', intent: 'control', state_verification: execution.verification?.status, result: publicControlExecution(execution) } }),
        result: { ...execution, kind: 'control' } };
    },
    async handle(payload = {}) {
      const language = responseLanguage(payload);
      const result = normalizeAssistantPlan(await createDraft({ ...payload, interaction_mode: 'auto' }), payload);

      // Exact duplicate names are resolved before the provider is called.
      if (result?.status === 'needs_confirmation' && Array.isArray(result?.candidates)) {
        const fallback = message('select_entity', language);
        return {
          intent: 'control',
          resolution: resolution('ambiguous'),
          message_key: 'select_entity',
          message: await narrate(createResponse, {
            payload, language, fallback,
            toolResult: {
              outcome: 'ambiguous', intent: 'control', reason: 'multiple_matching_entities',
              candidates: result.candidates.map(candidateDisplay),
            },
          }),
          role: 'entity_reference',
          resolution_key: result.resolution_key || null,
          candidates: result.candidates.map(candidateDisplay),
          provider: result.provider,
          model: result.model,
        };
      }

      if (result?.generation_error || result?.validation?.valid === false && !result?.plan) {
        const error = text(result?.generation_error || result?.validation?.errors?.[0] || 'The LLM did not return a usable plan.');
        return {
          intent: 'other',
          message_key: 'model_generation_invalid',
          message: message('model_generation_invalid', language),
          error,
          system: { status: 'error', code: 'model_generation_invalid' },
        };
      }

      if (result.status === 'needs_clarification') return { intent: result.intent || 'automation', resolution: resolution('needs_clarification'), message: result.question || result.questions?.[0] || message('invalid_request', language), missing_fields: result.missing_fields || [] };

      const intent = text(result?.intent || 'other').toLowerCase();
      let plan = result?.plan && typeof result.plan === 'object' ? result.plan : {};
      const missingFields = Array.isArray(result?.missing_fields) ? result.missing_fields.filter(Boolean) : [];

      if (intent === 'other') {
        return narratedFailure(createResponse, {
          payload, language, intent, failureReason: 'unsupported_capability', messageKey: 'other_unsupported',
        });
      }
      if (intent === 'routine') {
        return narratedFailure(createResponse, {
          payload, language, intent,
          failureReason: missingFields.length ? 'invalid_request' : 'unsupported_capability',
          messageKey: missingFields.length ? 'routine_missing' : 'routine_unsupported',
          extra: { missing_fields: missingFields, plan },
        });
      }

      // The first model call may nominate a real entity even though the live
      // embedding evidence leaves several same-capability candidates nearly
      // tied. The host owns that ambiguity decision and never executes until a
      // user selects one of its live candidates.
      const groundingAssessment = result?._grounding_assessment;
      if (groundingAssessment?.status === 'ambiguous') {
        const candidates = groundingCandidates(groundingAssessment);
        const selectedId = text(payload.selected_entity_id);
        const selected = candidates.find((candidate) => candidate.entity_id === selectedId);
        if (!selected) {
          const fallback = message('select_entity', language);
          return {
            intent,
            resolution: resolution('ambiguous'),
            message_key: 'select_entity',
            message: await narrate(createResponse, {
              payload, language, fallback,
              toolResult: {
                outcome: 'ambiguous', intent, reason: 'insufficient_entity_grounding',
                candidates,
              },
            }),
            role: `${intent}_target`,
            candidates,
            grounding: {
              reference: groundingAssessment.reference,
              margin: groundingAssessment.margin,
              minimum_margin: groundingAssessment.minimum_margin,
            },
          };
        }
        plan = {
          ...plan,
          target: { selector: 'entity', entity_id: selected.entity_id },
        };
      }

      const unresolvedReference = text(plan?.target?.selector) === 'unresolved'
        ? text(plan?.target?.reference) : '';

      const invalid = validationFailure(intent, result, language) || (result.validation?.valid === false ? failed(intent, 'invalid_request', 'invalid_request', language, { validation: result.validation }) : null);
      if (invalid) {
        return narratedFailure(createResponse, {
          payload, language, intent,
          failureReason: invalid.resolution.failure_reason,
          messageKey: invalid.message_key,
          extra: { validation: invalid.validation },
        });
      }
      if (missingFields.length) {
        return narratedFailure(createResponse, {
          payload, language, intent, failureReason: 'invalid_request', messageKey: 'invalid_request',
          extra: { missing_fields: missingFields },
        });
      }
      if (contextualTargetMismatch(plan, payload)) {
        return narratedFailure(createResponse, {
          payload, language, intent, failureReason: 'invalid_request', messageKey: 'invalid_request',
        });
      }
      if (intent === 'control' && collectionScopeMismatch(plan, payload.command)) {
        return narratedFailure(createResponse, {
          payload, language, intent, failureReason: 'invalid_request', messageKey: 'invalid_request',
        });
      }
      if (unresolvedReference) {
        return narratedFailure(createResponse, {
          payload, language, intent, failureReason: 'entity_not_found', messageKey: 'entity_not_found',
        });
      }

      if (intent === 'information') {
        const information = await queryInformation({ plan });
        if (information.status === 'entity_not_found') {
          return narratedFailure(createResponse, {
            payload, language, intent, failureReason: 'entity_not_found', messageKey: 'entity_not_found',
          });
        }
        if (information.status === 'unsupported_capability') {
          return narratedFailure(createResponse, {
            payload, language, intent, failureReason: 'unsupported_capability', messageKey: 'unsupported_capability',
          });
        }
        if (information.status === 'invalid_request') {
          return narratedFailure(createResponse, {
            payload, language, intent, failureReason: 'invalid_request', messageKey: 'invalid_request',
          });
        }
        if (information.status === 'ambiguous') {
          const candidates = (information.entities || []).map(candidateDisplay);
          const fallback = message('select_entity', language);
          return {
            intent,
            resolution: resolution('ambiguous'),
            message_key: 'select_entity',
            message: await narrate(createResponse, {
              payload, language, fallback,
              toolResult: {
                outcome: 'ambiguous', intent, reason: 'multiple_matching_entities', candidates,
              },
            }),
            role: 'information_target',
            candidates,
          };
        }
        const fallback = informationMessage(information, plan, payload.command, language);
        return {
          intent,
          resolution: resolution('success'),
          message_key: information.kind === 'collection' ? 'information_collection' : 'information_property',
          message: await narrate(createResponse, {
            payload, language, fallback,
            toolResult: {
              outcome: 'success', intent, operation: plan.operation,
              user_reference: verifiedUserReference(plan?.user_reference, payload.command) || null,
              result: information,
            },
          }),
          result: { ...information, query_kind: information.kind, kind: 'information' },
        };
      }

      if (intent === 'control') {
        const effect = plan.effect && typeof plan.effect === 'object' ? plan.effect : {};
        if (!text(effect.service) || !plan.target) {
          return narratedFailure(createResponse, {
            payload, language, intent, failureReason: 'invalid_request', messageKey: 'control_missing',
          });
        }
        try {
          const preview = await previewControl({
            service: effect.service,
            target: plan.target,
            data: effect.data,
            selected_entity_id: payload.selected_entity_id || null,
          });
          if (preview.status === 'needs_confirmation') {
            const candidates = (preview.candidates || []).map(candidateDisplay);
            const fallback = message('select_entity', language);
            return {
              intent,
              resolution: resolution('ambiguous'),
              message_key: 'select_entity',
              message: await narrate(createResponse, {
                payload, language, fallback,
                toolResult: {
                  outcome: 'ambiguous', intent, reason: 'multiple_compatible_targets', candidates,
                },
              }),
              role: 'control_target',
              candidates,
              control_preview: preview,
            };
          }
          return {
            intent, resolution: resolution('needs_confirmation'),
            message_key: 'control_ready', message: message('control_ready', language),
            control_preview: preview, provider: result.provider, model: result.model,
          };
        } catch (error) {
          const code = text(error?.code);
          if (code === 'no_compatible_entity' || code === 'invalid_selection') {
            return narratedFailure(createResponse, {
              payload, language, intent, failureReason: 'entity_not_found', messageKey: 'entity_not_found',
            });
          }
          if (code === 'unsupported_service' || code === 'unsupported_service_data'
            || code === 'draft_only_service' || code === 'targetless_control_not_enabled') {
            return narratedFailure(createResponse, {
              payload, language, intent, failureReason: 'unsupported_capability', messageKey: 'unsupported_capability',
            });
          }
          if (code === 'missing_service_data' || code === 'invalid_service_data' || code === 'invalid_target') {
            return narratedFailure(createResponse, {
              payload, language, intent, failureReason: 'invalid_request', messageKey: 'invalid_request',
            });
          }
          throw error;
        }
      }

      if (intent === 'automation') {
        if (!result?.validation?.valid || !result?.automation) {
          return {
            intent,
            message_key: 'automation_generation_invalid',
            message: message('automation_generation_invalid', language),
            error: text(result?.validation?.errors?.[0]),
            system: { status: 'error', code: 'automation_generation_invalid' },
          };
        }
        const automationResult = {
          kind: 'automation',
          yaml: plan.yaml || '',
          normalized_yaml: result.normalized_yaml || plan.normalized_yaml || '',
          automation: result.automation,
          validation: { ...(result.validation || {}) },
        };
        const fallback = message('automation_ready', language);
        return {
          intent,
          resolution: resolution('success'),
          message_key: 'automation_ready',
          message: await narrate(createResponse, {
            payload, language, fallback,
            toolResult: {
              outcome: 'success', intent, operation: plan.operation,
              result: {
                alias: automationResult.automation?.alias || null,
                trigger_count: automationResult.automation?.triggers?.length || 0,
                action_count: automationResult.automation?.actions?.length || 0,
              },
            },
          }),
          result: automationResult,
          provider: result.provider,
          model: result.model,
          pipeline: result.pipeline,
          context: result.context,
        };
      }

      return narratedFailure(createResponse, {
        payload, language, intent, failureReason: 'invalid_request', messageKey: 'request_not_understood',
      });
    },
  };
}
