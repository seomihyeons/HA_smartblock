import { ACTION_DOMAINS } from '../../src/data/options';

const supportedConditionTypes = new Set([
  'state',
  'numeric_state',
  'time',
  'sun',
  'and',
  'or',
  'not',
]);

const supportedTriggerTypes = new Set([
  'state',
  'numeric_state',
  'time',
  'sun',
  'homeassistant',
]);

const supportedActionDomains = new Set(ACTION_DOMAINS || []);
supportedActionDomains.add('homeassistant');
supportedActionDomains.add('cover');

function firstLine(block) {
  const raw = String(block.getFieldValue?.('RAW_LINES') || block.getFieldValue?.('YAML') || '');
  return (raw.split('\n').find((l) => l.trim()) || '').trim();
}

function parseValue(line, prefix) {
  if (!line.startsWith(prefix)) return '';
  return line.slice(prefix.length).trim();
}

function classifyByLine(line) {
  if (line.startsWith('- condition:')) {
    const t = parseValue(line, '- condition:');
    return supportedConditionTypes.has(t) ? 'REGRESSION_SUSPECT' : 'NEW_SUPPORT_CANDIDATE';
  }
  if (line.startsWith('- trigger:')) {
    const t = parseValue(line, '- trigger:');
    return supportedTriggerTypes.has(t) ? 'REGRESSION_SUSPECT' : 'NEW_SUPPORT_CANDIDATE';
  }
  if (line.startsWith('- action:')) {
    const svc = parseValue(line, '- action:');
    const domain = String(svc).split('.')[0] || '';
    return supportedActionDomains.has(domain) ? 'REGRESSION_SUSPECT' : 'NEW_SUPPORT_CANDIDATE';
  }
  return 'NEW_SUPPORT_CANDIDATE';
}

export function classifyRawBlocks(rawBlocks) {
  return (rawBlocks || []).map((b) => {
    const head = firstLine(b);
    return {
      type: b.type,
      head,
      class: classifyByLine(head),
    };
  });
}
