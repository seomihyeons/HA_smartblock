import { normalizeAutomationContext } from './automation_context.mjs';
import { inspectSelectedAutomation } from './automation_readonly.mjs';
const text = (value) => String(value ?? '').trim();

function numericThreshold(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

/**
 * The LLM speaks Home Assistant YAML; Blockly derives its segmented control
 * from those standard `above`/`below` fields. Validate the shared meaning at
 * the host boundary rather than accepting UI-only or malformed thresholds.
 */
export function validateNumericStateThresholds(automation) {
  const errors = [];
  const validateNode = (node, path) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    if (text(node.trigger || node.condition) === 'numeric_state') {
      const hasAbove = node.above !== undefined && node.above !== null && node.above !== '';
      const hasBelow = node.below !== undefined && node.below !== null && node.below !== '';
      if (!hasAbove && !hasBelow) {
        errors.push(`${path} numeric_state requires above, below, or both thresholds.`);
      } else {
        const above = hasAbove ? numericThreshold(node.above) : null;
        const below = hasBelow ? numericThreshold(node.below) : null;
        if (hasAbove && above === null) errors.push(`${path}.above must be a finite numeric threshold.`);
        if (hasBelow && below === null) errors.push(`${path}.below must be a finite numeric threshold.`);
        if (above !== null && below !== null && above >= below) {
          errors.push(`${path} Between thresholds require above to be less than below.`);
        }
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'entity_id') continue;
      if (Array.isArray(value)) value.forEach((child, index) => validateNode(child, `${path}.${key}[${index}]`));
      else if (value && typeof value === 'object') validateNode(value, `${path}.${key}`);
    }
  };
  const root = automation && typeof automation === 'object' ? automation : {};
  (Array.isArray(root.triggers) ? root.triggers : []).forEach((trigger, index) => validateNode(trigger, `triggers[${index}]`));
  (Array.isArray(root.conditions) ? root.conditions : []).forEach((condition, index) => validateNode(condition, `conditions[${index}]`));
  return errors;
}

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
    control_ready: '기기 제어 계획을 만들었습니다.',
    control_completed: '요청한 동작을 완료했습니다.',
    automation_generation_invalid: '자동화 초안을 검증하지 못했습니다.',
    automation_ready: '검증된 자동화 초안을 만들었습니다.',
    goal_automation_ready: '연결된 기기를 이용한 목표 기반 자동화 초안을 만들었습니다. Home Assistant에 저장하기 전에 블록을 검토해 주세요.',
    goal_plan_no_actions: '목표를 이해했지만 현재 연결된 기기로 검증 가능한 자동화 초안을 생성하지 못했습니다.',
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
    control_ready: 'A device-control plan was created.',
    control_completed: 'The requested action was completed.',
    automation_generation_invalid: 'The automation draft could not be validated.',
    automation_ready: 'A validated automation draft was created.',
    goal_automation_ready: 'I prepared an automation draft for this goal using your connected devices. Review the blocks before saving it to Home Assistant.',
    goal_plan_no_actions: 'I understood the goal, but could not prepare a verified automation draft from the available Home Assistant devices.',
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

// Capitalize ordinary English display labels at sentence start, while keeping
// literal Home Assistant entity IDs unchanged for users who need to copy them.
function sentenceInitialReference(value) {
  const label = text(value);
  if (!label) return '';
  if (/^[a-z_]+\.[a-z0-9_]+$/i.test(label)) return `The device ${label}`;
  return label.replace(/^[a-z]/, (letter) => letter.toUpperCase());
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
  if (information?.kind === 'entity_identity') {
    const entity = information.entity || {};
    return language === 'ko'
      ? `${reference || '요청하신 사용자'}의 Entity ID는 ${entity.entity_id}이며 현재 상태는 ${localizedState(entity.state, language)}.`
      : `${sentenceInitialReference(reference) || 'The requested entity'} is ${entity.entity_id} (currently ${localizedState(entity.state, language)}).`;
  }
  if (information?.kind === 'service_collection') {
    const services = (information.services || []).map((service) => text(service.id)).filter(Boolean);
    return language === 'ko'
      ? (services.length ? `현재 사용 가능한 서비스: ${services.join(', ')}.` : '현재 조건에 맞는 서비스가 없습니다.')
      : (services.length ? `Available services: ${services.join(', ')}.` : 'No matching services are currently available.');
  }
  if (information?.kind === 'service_capability') {
    const service = information.service || {};
    const required = (service.fields || []).filter((field) => field?.required).map((field) => text(field.name)).filter(Boolean);
    return language === 'ko'
      ? (required.length ? `${service.id}의 필수 파라미터: ${required.join(', ')}.` : `${service.id}에는 필수 파라미터가 없습니다.`)
      : (required.length ? `${service.id} requires: ${required.join(', ')}.` : `${service.id} has no required parameters.`);
  }
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
  const state = localizedState(information?.entity?.state, language);
  if (language === 'ko') {
    return /[가-힣]/.test(reference)
      ? `${reference}${koreanTopicParticle(reference)} 현재 ${state}.`
      : `${reference}: ${state}`;
  }
  return `${sentenceInitialReference(reference) || 'The device'} is currently ${state}.`;
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
    verification: execution.verification || null,
  };
}

// Use the trusted execution result rather than spending a second LLM call
// to paraphrase a short command. Never claim a physical state unless the
// latest Home Assistant observation confirmed it.
function controlCompletionMessage(execution = {}, language = 'en') {
  if (language === 'ko') return message('control_completed', language);
  const count = Number(execution.target_count) || 0;
  const entity = execution.entity || {};
  const name = text(entity.display_name || entity.name || entity.entity_id);
  const verb = text(execution.service).split('.')[1]?.replaceAll('_', ' ') || 'control';
  const target = count === 1 && name ? name : count > 1 ? `${count} devices` : 'the selected device';
  const observed = Array.isArray(execution.verification?.observed)
    ? execution.verification.observed : [];
  if (count === 1 && execution.verification?.status === 'confirmed' && observed[0]?.state != null) {
    return `${sentenceInitialReference(name) || 'The device'} is now ${text(observed[0].state)}.`;
  }
  if (execution.verification?.status === 'not_confirmed') {
    return `I sent the command to ${verb} ${target}, but could not confirm the resulting state.`;
  }
  return `I sent the command to ${verb} ${target}.`;
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
  createDraft, previewControl, executeControl, queryInformation, createResponse, explainAutomation,
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
    async handle(payload = {}) {
      const language = responseLanguage(payload);
      const result = await createDraft({ ...payload, interaction_mode: 'auto' });
      if (result?.status === 'automation_collection_ready') {
        const ha = result.automation_list?.home_assistant || [];
        const drafts = result.automation_list?.recent_drafts || [];
        const messageText = language === 'ko'
          ? [
              ha.length ? `Home Assistant 자동화 (${ha.length}개):` : 'Home Assistant 자동화가 없습니다.',
              ...ha.map((item) => `• ${item.title} (${item.enabled ? '활성' : '비활성'})`),
              ...(drafts.length ? [`현재 채팅 초안 (${drafts.length}개):`, ...drafts.map((item) => `• ${item.title}`)] : []),
            ].join('\n')
          : [
              ha.length ? `Home Assistant automations (${ha.length}):` : 'No Home Assistant automations found.',
              ...ha.map((item) => `• ${item.title} (${item.enabled ? 'enabled' : 'disabled'})`),
              ...(drafts.length ? [`Chat drafts (${drafts.length}):`, ...drafts.map((item) => `• ${item.title}`)] : []),
            ].join('\n');
        return {
          intent: 'information', resolution: resolution('success'),
          message_key: 'automation_collection', message: messageText,
          result: { kind: 'information', kind_detail: 'automation_collection',
            home_assistant: ha, recent_drafts: drafts },
          pipeline: result.pipeline,
        };
      }
      if (result?.status === 'automation_readonly_ready') {
        const selectedAutomation = normalizeAutomationContext(result.automation_context);
        if (!selectedAutomation || !['inspect', 'explain'].includes(selectedAutomation.operation)) {
          return failed('automation', 'invalid_request', 'invalid_request', language);
        }
        const inspection = inspectSelectedAutomation(selectedAutomation, selectedAutomation.operation);
        if (!inspection.ok) {
          return {
            intent: 'automation', resolution: resolution('failed', 'invalid_request'),
            message_key: 'invalid_request', message: inspection.error,
            validation: { valid: false, errors: [inspection.detail || inspection.error] },
          };
        }
        let explanation = inspection.summary;
        if (selectedAutomation.operation === 'explain' && typeof explainAutomation === 'function') {
          try {
            const generated = await explainAutomation({
              command: payload.command,
              responseLanguage: language,
              provider: payload.provider,
              title: selectedAutomation.title,
              yaml: selectedAutomation.base_yaml,
              inspection,
            });
            if (text(generated?.response)) explanation = text(generated.response);
          } catch {
            // Read-only deterministic review remains available when provider
            // explanation is unavailable or produces an empty response.
          }
        }
        return {
          intent: 'automation', resolution: resolution('success'),
          message_key: 'automation_inspected', message: explanation,
          result: { kind: 'automation_readonly', ...inspection },
          pipeline: result.pipeline,
        };
      }
      if (result?.status === 'automation_unchanged') {
        return {
          intent: 'automation',
          resolution: resolution('failed', 'automation_unchanged'),
          message_key: 'automation_unchanged',
          message: language === 'ko'
            ? '요청하신 변경을 적용하지 못했습니다. 기존 자동화는 그대로 유지됩니다. 요청한 기기가 Home Assistant에 있는지 확인하거나 다른 방법으로 요청해 주세요.'
            : 'I couldn\'t apply the requested change. The automation is unchanged. Check whether the requested device exists in Home Assistant or clarify the request.',
          pipeline: result.pipeline,
        };
      }
      if (result?.status === 'base_automation_entities_unavailable') {
        const unavailable = Array.isArray(result.unavailable_entity_ids) ? result.unavailable_entity_ids : [];
        const detail = unavailable.length ? unavailable.join(', ') : 'an existing entity';
        return {
          intent: 'automation',
          resolution: resolution('failed', 'base_automation_entity_unavailable'),
          message_key: 'base_automation_entity_unavailable',
          message: `The selected automation references unavailable Home Assistant entity IDs: ${detail}. It was not modified.`,
          unavailable_entity_ids: unavailable,
          validation: result.validation,
        };
      }

      if (result?.status === 'needs_automation_selection' && Array.isArray(result?.candidates)) {
        return {
          intent: 'automation',
          resolution: resolution(result.candidates.length ? 'ambiguous' : 'failed',
            result.candidates.length ? null : 'automation_context_required'),
          message_key: result.candidates.length ? 'select_automation' : 'invalid_request',
          message: result.question || (result.candidates.length
            ? 'Select an active Home Assistant automation to edit.'
            : 'No active Home Assistant automation is available to edit.'),
          role: 'automation_reference',
          candidates: result.candidates,
          missing_fields: result.candidates.length ? [] : ['automation_context'],
        };
      }

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

      const intent = text(result?.intent || 'other').toLowerCase();
      let plan = result?.plan && typeof result.plan === 'object' ? result.plan : {};
      const missingFields = Array.isArray(result?.missing_fields) ? result.missing_fields.filter(Boolean) : [];

      if (intent === 'other') {
        return narratedFailure(createResponse, {
          payload, language, intent, failureReason: 'unsupported_capability', messageKey: 'other_unsupported',
        });
      }
      const isGoalAutomation = intent === 'routine' && plan.operation === 'automation_generation';
      if (intent === 'routine' && !isGoalAutomation) {
        if (missingFields.length) {
          return narratedFailure(createResponse, {
            payload, language, intent, failureReason: 'invalid_request',
            messageKey: 'routine_missing', extra: { missing_fields: missingFields, plan },
          });
        }
        return {
          intent,
          resolution: resolution('failed', 'no_grounded_goal_actions'),
          message_key: 'goal_plan_no_actions',
          message: message('goal_plan_no_actions', language),
          result: { kind: 'goal_plan', goal: text(plan.goal) },
        };
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

      const invalid = validationFailure(intent, result, language);
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
      // `plan.target` is a control/information planning selector. Automation
      // modifications are validated from their YAML and must not be rejected
      // merely because this optional general-control field is unresolved.
      if (unresolvedReference && intent !== 'automation') {
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
          result: { kind: 'information', ...information },
        };
      }

      if (intent === 'control') {
        // A discourse continuation next to a selected automation draft can
        // mean "add this action", not "execute now". Never physically change
        // devices on that ambiguous interpretation, even if a model guessed
        // control. Only a clear immediate-execution request can bypass it.
        const continuation = /^(?:also\b|and\b|plus\b|그리고|추가로|그것도)/i.test(text(payload.command));
        const immediate = /\b(?:now|right now|immediately)\b|지금|즉시|바로\s*(?:실행|켜|꺼)/i.test(text(payload.command));
        const selectedDraft = normalizeAutomationContext({
          ...(payload.automation_context || {}), operation: 'modify',
        });
        if (continuation && !immediate && selectedDraft?.source === 'recent_draft') {
          return {
            intent: 'control', resolution: resolution('ambiguous'),
            message_key: 'automation_or_immediate_control',
            message: language === 'ko'
              ? '현재 자동화에 동작을 추가할까요, 아니면 기기를 지금 제어할까요? 자동으로 실행하지 않았습니다.'
              : 'Do you want to add this action to the automation or control the device now? Nothing was executed.',
            role: 'operation_scope',
          };
        }
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
          const execution = await executeControl({ execution_id: preview.execution_id });
          const fallback = controlCompletionMessage(execution, language);
          return {
            intent,
            resolution: resolution('success'),
            message_key: 'control_completed',
            message: await narrate(createResponse, {
              payload, language, fallback,
              toolResult: {
                outcome: 'success', intent, operation: plan.operation,
                user_reference: verifiedUserReference(plan?.user_reference, payload.command) || null,
                service: effect.service,
                result: publicControlExecution(execution),
              },
            }),
            result: { kind: 'control', ...execution },
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
          if (code === 'missing_service_data' || code === 'invalid_target') {
            return narratedFailure(createResponse, {
              payload, language, intent, failureReason: 'invalid_request', messageKey: 'invalid_request',
            });
          }
          throw error;
        }
      }

      if (intent === 'automation' || isGoalAutomation) {
        if (!result?.validation?.valid || !result?.automation) {
          return {
            intent,
            message_key: 'automation_generation_invalid',
            message: message('automation_generation_invalid', language),
            error: text(result?.validation?.errors?.[0]),
            system: { status: 'error', code: 'automation_generation_invalid' },
          };
        }
        const numericStateErrors = validateNumericStateThresholds(result.automation);
        if (numericStateErrors.length) {
          return {
            intent,
            message_key: 'automation_generation_invalid',
            message: message('automation_generation_invalid', language),
            error: numericStateErrors[0],
            validation: { ...(result.validation || {}), valid: false, errors: numericStateErrors },
            system: { status: 'error', code: 'automation_generation_invalid' },
          };
        }
        const automationResult = {
          kind: 'automation',
          operation: result.automation_operation || 'create',
          base_context: result.automation_context || null,
          yaml: plan.yaml || '',
          normalized_yaml: result.normalized_yaml || plan.normalized_yaml || '',
          goal: isGoalAutomation ? text(plan.goal) : null,
          automation: result.automation,
          validation: {
            ...(result.validation || {}),
            schema_valid: result.validation?.schema_valid === true ? true : null,
            grounded: result.validation?.grounded === true ? true : null,
            capability_valid: result.validation?.capability_valid === true ? true : null,
            // Importing Blockly and verifying YAML round-trip happen later
            // in the browser and must never be inferred from plan generation.
            blockly_supported: null,
            roundtrip_verified: null,
          },
        };
        const responseKey = isGoalAutomation ? 'goal_automation_ready' : 'automation_ready';
        const fallback = message(responseKey, language);
        return {
          intent,
          resolution: resolution('success'),
          message_key: responseKey,
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
