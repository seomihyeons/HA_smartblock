import { DOMAIN_SPEC, getNotifyTargetOptions } from '../data/options.js';

const TEMPLATE_RE = /\{[{%][\s\S]*?[}%]\}/;
const UNSUPPORTED_FLOW_KEYS = new Set([
  'repeat', 'wait_for_trigger', 'wait_template', 'parallel', 'sequence',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasTemplate(value) {
  if (typeof value === 'string') return TEMPLATE_RE.test(value);
  if (Array.isArray(value)) return value.some(hasTemplate);
  if (isPlainObject(value)) return Object.values(value).some(hasTemplate);
  return false;
}

function referencesAutomationVariable(value, variableNames) {
  if (!variableNames.length) return false;
  if (typeof value === 'string') {
    if (!TEMPLATE_RE.test(value)) return false;
    return variableNames.some((name) => new RegExp(`\\b${String(name).replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`).test(value));
  }
  if (Array.isArray(value)) return value.some((item) => referencesAutomationVariable(item, variableNames));
  if (isPlainObject(value)) return Object.values(value).some((item) => referencesAutomationVariable(item, variableNames));
  return false;
}

function hasEntityTarget(action) {
  const raw = action?.target?.entity_id ?? action?.entity_id ?? action?.data?.entity_id;
  const values = Array.isArray(raw) ? raw : [raw];
  return values.some((value) => typeof value === 'string' && value.trim() && !hasTemplate(value));
}

function hasSupportedConditionList(conditions) {
  if (!Array.isArray(conditions) || !conditions.length) return false;

  return conditions.every((condition) => {
    if (!isPlainObject(condition) || hasTemplate(condition)) return false;
    const type = String(condition.condition || '').trim();

    if (type === 'and' || type === 'or' || type === 'not') {
      return hasSupportedConditionList(
        Array.isArray(condition.conditions) ? condition.conditions : [],
      );
    }

    return ['state', 'numeric_state', 'sun', 'time'].includes(type);
  });
}

function isSupportedServiceAction(action, options) {
  const service = String(action?.action ?? action?.service ?? '').trim();
  if (!service || hasTemplate(service)) return false;

  if (service.startsWith('notify.')) {
    const target = service.slice('notify.'.length);
    return options.notifyTargets.has(target);
  }
  if (service.startsWith('script.') || service.startsWith('python_script.')) return true;
  if (service === 'mqtt.publish') return true;

  const [domain, method] = service.split('.', 2);
  const supported = DOMAIN_SPEC[domain]?.actions?.some(([, value]) => value === method);
  if (!supported) return false;

  // Typed entity action blocks require an explicit non-template entity target.
  return hasEntityTarget(action);
}

function isSupportedSequenceAction(action, options) {
  if (!isPlainObject(action) || hasTemplate(action)) return false;

  if (Object.prototype.hasOwnProperty.call(action, 'choose')) {
    return evaluateChooseTypedRepresentability(action, options).eligible;
  }

  if ([...UNSUPPORTED_FLOW_KEYS].some((key) => Object.prototype.hasOwnProperty.call(action, key))) {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(action, 'delay')) {
    return Object.keys(action).every((key) => ['delay', 'id'].includes(key));
  }

  return isSupportedServiceAction(action, options);
}

function hasSupportedSequence(sequence, options) {
  return Array.isArray(sequence)
    && sequence.length > 0
    && sequence.every((action) => isSupportedSequenceAction(action, options));
}

/**
 * A typed if/then Blockly block only represents one static Home Assistant
 * choose branch. Anything broader must stay as one raw action so import never
 * discards branches or dynamic semantics.
 */
export function evaluateChooseTypedRepresentability(action, config = {}) {
  const notifyTargets = new Set(
    (config.notifyTargets || getNotifyTargetOptions().map(([, value]) => value))
      .map((value) => String(value)),
  );
  const options = { notifyTargets };
  const variableNames = Array.isArray(config.automationVariables)
    ? config.automationVariables.map((name) => String(name)).filter(Boolean)
    : [];
  const choices = action?.choose;

  if (!Array.isArray(choices) || choices.length !== 1) {
    return { eligible: false, reason: 'choose_requires_exactly_one_branch' };
  }
  if (referencesAutomationVariable(action, variableNames)) {
    return { eligible: false, reason: 'automation_variable_reference' };
  }
  if (hasTemplate(action)) {
    return { eligible: false, reason: 'dynamic_template_or_variable_reference' };
  }

  const choice = choices[0];
  if (!isPlainObject(choice) || !hasSupportedConditionList(choice.conditions)) {
    return { eligible: false, reason: 'unsupported_choose_condition' };
  }
  if (!hasSupportedSequence(choice.sequence, options)) {
    return { eligible: false, reason: 'unsupported_choose_sequence' };
  }

  if (Object.prototype.hasOwnProperty.call(action, 'default')
    && !hasSupportedSequence(action.default, options)) {
    return { eligible: false, reason: 'unsupported_choose_default' };
  }

  return { eligible: true, reason: 'typed_if_supported' };
}
