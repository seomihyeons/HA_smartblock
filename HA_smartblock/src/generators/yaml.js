// src/generators/yaml.js

import * as Blockly from 'blockly';
export const yamlGenerator = new Blockly.CodeGenerator('YAML');

const Order = {
  ATOMIC: 0,
};

yamlGenerator.INDENT = '  ';

/* ===== Common value blocks ===== */
yamlGenerator.forBlock['logic_null'] = function (block) {
  return ['null', Order.ATOMIC];
};
yamlGenerator.forBlock['text'] = function (block) {
  const textValue = block.getFieldValue('TEXT') ?? '';
  const escaped = String(textValue).replace(/"/g, '\\"');
  return [`"${escaped}"`, Order.ATOMIC];
};
yamlGenerator.forBlock['math_number'] = function (block) {
  return [String(block.getFieldValue('NUM')), Order.ATOMIC];
};
yamlGenerator.forBlock['logic_boolean'] = function (block) {
  return [(block.getFieldValue('BOOL') === 'TRUE') ? 'true' : 'false', Order.ATOMIC];
};

yamlGenerator.forBlock['ha_triggers_raw'] = function (block) {
  const raw = normalizeRawYaml(block.getFieldValue('YAML') ?? '');
  return raw || '';
};

yamlGenerator.forBlock['ha_conditions_raw'] = function (block) {
  const raw = normalizeRawYaml(block.getFieldValue('YAML') ?? '');
  return raw || '';
};

yamlGenerator.forBlock['ha_actions_raw'] = function (block) {
  const raw = normalizeRawYaml(block.getFieldValue('YAML') ?? '');
  return raw || '';
};

/* ===== Home Assistant custom blocks ===== */
function emitRawLines(block) {
  const raw = String(block.getFieldValue('RAW_LINES') || '').replace(/\r\n/g, '\n');
  if (!raw.trim()) return '';
  const lines = raw.split('\n');
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n') + '\n';
}

yamlGenerator.forBlock['ha_event_raw_lines'] = function (block) {
  return emitRawLines(block);
};
yamlGenerator.forBlock['ha_condition_raw_lines'] = function (block) {
  return emitRawLines(block);
};
yamlGenerator.forBlock['ha_action_raw_lines'] = function (block) {
  return emitRawLines(block);
};



// EA container block (Event-Action)
yamlGenerator.forBlock['event_action'] = function (block, generator) {
  const alias = block.getFieldValue('ALIAS') || '';
  const id = block.getFieldValue('ID') || '';
  const escapeSq = (s) => String(s).replace(/'/g, "''");
  const eventCode = generator.statementToCode(block, 'EVENT');
  const actionCode = generator.statementToCode(block, 'ACTION');

  let code = `- alias: '${escapeSq(alias)}'\n`;
  if (id && id != "(Optional)") { code += `  id: '${escapeSq(id)}'\n`; }

  code += `\n  triggers:\n`; code += generator.prefixLines(eventCode, `  `);
  code += `\n  actions:\n`; code += generator.prefixLines(actionCode, `  `);

  return code;
};

// ECA container block (Event-Condition-Action)
yamlGenerator.forBlock['event_condition_action'] = function (block, generator) {
  const alias = block.getFieldValue('ALIAS') || '';
  const id = block.getFieldValue('ID') || '';
  const escapeSq = (s) => String(s).replace(/'/g, "''");
  const eventCode = generator.statementToCode(block, 'EVENT');
  const conditionCode = generator.statementToCode(block, 'CONDITION');
  const actionCode = generator.statementToCode(block, 'ACTION');

  let code = `- alias: '${escapeSq(alias)}'\n`;
  if (id && id != "(Optional)") { code += `  id: '${escapeSq(id)}'\n`; }

  code += `\n  triggers:\n`; code += generator.prefixLines(eventCode, `  `);
  if (conditionCode && conditionCode.trim()) {
    code += `\n  conditions:\n`; code += generator.prefixLines(conditionCode, `  `);
  }
  code += `\n  actions:\n`; code += generator.prefixLines(actionCode, `  `);

  return code;
};


// Event: Home Assistant lifecycle (homeassistant trigger)
yamlGenerator.forBlock['ha_event_homeassistant'] = function (block) {
  const event = block.getFieldValue('EVENT') || 'start';

  let code = '';
  code += '- trigger: homeassistant\n';
  code += `  event: ${event}\n`;

  const next = block.getNextBlock();
  if (next) {
    code += yamlGenerator.blockToCode(next);
  }
  return code;
};


/* ===== Events (compact) ===== */
import { STATE_DOMAINS, ACTION_DOMAINS } from '../data/options.js';

/* ===== Events (unified, compact) ===== */

// Event: state trigger (event_${domain}_state)
for (const domain of (STATE_DOMAINS || [])) {
  yamlGenerator.forBlock[`event_${domain}_state`] = function (block, generator) {
    const entityId = block.getFieldValue('ENTITY_ID') || '';
    const from = block.getFieldValue('FROM') || '';
    const to   = block.getFieldValue('TO')   || '';
    const forValue = generator.valueToCode(block, 'FOR', 0) || '';
    const useId = block.getFieldValue('USE_ID') === 'TRUE';
    const id = String(block.getFieldValue('ID') || '').trim();

    if (!entityId) return '';

    const i = yamlGenerator.INDENT;
    const lines = [
      `- trigger: state`,
      `${i}entity_id: ${entityId}`,
    ];

    if (from) lines.push(`${i}from: '${from}'`);
    if (to)   lines.push(`${i}to: '${to}'`);
    if (forValue.trim()) lines.push(`${i}for: ${forValue}`);
    if (useId && id) lines.push(`${i}id: ${JSON.stringify(id)}`);

    lines.push('');
    return lines.join('\n');
  };
}

// Event: numeric_state (sensor)
yamlGenerator.forBlock['event_sensor_numeric_state'] = function (block, generator) {
  const entityId = block.getFieldValue('ENTITY_ID') || '';
  if (!entityId) return '';

  const above = Number(block.getFieldValue('ABOVE'));
  const below = Number(block.getFieldValue('BELOW'));
  const forValue = generator.valueToCode(block, 'FOR', 0) || '';
  const useId = block.getFieldValue('USE_ID') === 'TRUE';
  const id = String(block.getFieldValue('ID') || '').trim();

  const i = yamlGenerator.INDENT;
  const lines = [
    `- trigger: numeric_state`,
    `${i}entity_id: ${entityId}`,
  ];

  if (!Number.isNaN(above) && above !== 0) lines.push(`${i}above: ${above}`);
  if (!Number.isNaN(below) && below !== 0) lines.push(`${i}below: ${below}`);
  if (forValue.trim()) lines.push(`${i}for: ${forValue}`);
  if (useId && id) lines.push(`${i}id: ${JSON.stringify(id)}`);

  lines.push('');
  return lines.join('\n');
};

// Event: numeric_state (sensor)
yamlGenerator.forBlock['ha_event_numeric_state_sensor'] = function (block) {
  const entityId = block.getFieldValue('ENTITY') || '';
  const above = block.getFieldValue('ABOVE');
  const below = block.getFieldValue('BELOW');
  const forValue = yamlGenerator.valueToCode(block, 'FOR', 0) || '';

  let code = `- trigger: numeric_state\n`;
  code += `  entity_id: ${entityId}\n`;
  if (above !== '' && !Number.isNaN(Number(above)) && Number(above) !== 0) { code += `  above: ${Number(above)}\n`; }
  if (below !== '' && !Number.isNaN(Number(below)) && Number(below) !== 0) { code += `  below: ${Number(below)}\n`; }
  if (forValue.trim()) { code += `  for: ${forValue}\n`; }

  return code;
};

// Event: for H:M:S value block
yamlGenerator.forBlock['ha_event_for_hms'] = function (block) {
  const toInt = (v) => {
    const n = parseInt(v ?? '0', 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const z2 = (n) => String(n).padStart(2, '0');

  const h = z2(toInt(block.getFieldValue('H')));
  const m = z2(toInt(block.getFieldValue('M')));
  const s = z2(toInt(block.getFieldValue('S')));

  const hhmmss = `${h}:${m}:${s}`;
  return [`"${hhmmss}"`, Order.ATOMIC];
};

// Event: time trigger
// src/generators/event_time_state.js
yamlGenerator.forBlock['ha_event_time_state'] = function (block, generator) {
  const hour12 = Number(block.getFieldValue('HOUR') || 0);
  const minute = Number(block.getFieldValue('MIN') || 0);
  const period = block.getFieldValue('PERIOD') || 'AM';

  // 12시간제를 24시간제로 변환
  let h = hour12 % 12;
  if (period === 'PM') h += 12;
  const HH = String(h).padStart(2, '0');
  const MM = String(minute).padStart(2, '0');

  // 기본 time trigger YAML
  let code = `- trigger: time\n`;
  code += `  at: '${HH}:${MM}:00'\n`;

  // 오른쪽에 붙는 EXTRA input (예: 주/월 제약 블록에서 나오는 YAML)
  const extra = generator.valueToCode(block, 'EXTRA', 0 /* Order.ATOMIC */) || '';
  if (extra) { code += generator.prefixLines(extra, '  '); }

  return code;
};

function emitTimePatternYamlScalar(raw) {
  const v = String(raw ?? '').trim();
  if (!v) return '';
  if (/^\d+$/.test(v)) return String(Number(v));
  return JSON.stringify(v);
}

yamlGenerator.forBlock['ha_event_time_pattern'] = function (block) {
  const hours = String(block.getFieldValue('HOURS') || '').trim();
  const minutes = String(block.getFieldValue('MINUTES') || '').trim();
  const seconds = String(block.getFieldValue('SECONDS') || '').trim();
  const useId = block.getFieldValue('USE_ID') === 'TRUE';
  const id = String(block.getFieldValue('ID') || '').trim();

  if (!hours && !minutes && !seconds) return '';

  let code = `- trigger: time_pattern\n`;
  if (hours) code += `  hours: ${emitTimePatternYamlScalar(hours)}\n`;
  if (minutes) code += `  minutes: ${emitTimePatternYamlScalar(minutes)}\n`;
  if (seconds) code += `  seconds: ${emitTimePatternYamlScalar(seconds)}\n`;
  if (useId && id) code += `  id: ${JSON.stringify(id)}\n`;
  return code;
};

// action: sun
yamlGenerator.forBlock['ha_event_sun'] = function (block, generator) {
  const event = block.getFieldValue('EVENT') || 'sunrise';
  const offsetCode = generator.valueToCode(block, 'OFFSET', 0 /* Order.ATOMIC */) || '';

  let code = `- trigger: sun\n`;
  code += `  event: ${event}\n`;
  if (offsetCode.trim()) { code += `  offset: ${offsetCode}\n`; }
  return code;
};

//action: sun offset
yamlGenerator.forBlock['ha_event_offset'] = function (block) {
  const sign = (block.getFieldValue('SIGN') === '-') ? '-' : '+'; // '+' | '-'

  const z2 = (n) => String(Math.max(0, Number(n) || 0)).padStart(2, '0');
  const h = z2(block.getFieldValue('H'));
  const m = z2(block.getFieldValue('M'));
  const s = z2(block.getFieldValue('S'));
  const hhmmss = `${h}:${m}:${s}`;

  const isZero = (h === '00' && m === '00' && s === '00');

  if (isZero) { return ['', Order.ATOMIC]; }
  if (sign === '-') { return [`"-${hhmmss}"`, Order.ATOMIC]; }
  return [`"${hhmmss}"`, Order.ATOMIC];
};

yamlGenerator.forBlock['ha_event_sun_state'] = function (block) {
  const from = block.getFieldValue('FROM') || '';
  const to = block.getFieldValue('TO') || '';
  const forValue = yamlGenerator.valueToCode(block, 'FOR', 0) || '';

  const lines = [];
  lines.push('- trigger: state');
  lines.push('  entity_id: sun.sun');

  // "(any)" 선택 시 FROM 값은 '' 이라서 생략
  if (from) {
    lines.push(`  from: '${from}'`);
  }
  if (to) {
    lines.push(`  to: '${to}'`);
  }
  if (forValue.trim()) {
    lines.push(`  for: ${forValue}`);
  }

  // statementToCode로 이어붙을 때를 대비해서 끝에 개행 추가
  return lines.join('\n') + '\n';
};

yamlGenerator.forBlock['ha_event_event'] = function (block, generator) {
  const eventType = String(block.getFieldValue('EVENT_TYPE') || '').trim();
  if (!eventType) return '';

  const eventDataCode = block.getInput('EVENT_DATA')
    ? (generator.statementToCode(block, 'EVENT_DATA') || '')
    : '';
  const contextCode = block.getInput('CONTEXT_DATA')
    ? (generator.statementToCode(block, 'CONTEXT_DATA') || '')
    : '';

  let code = `- trigger: event\n`;
  code += `  event_type: ${JSON.stringify(eventType)}\n`;
  if (eventDataCode.trim()) {
    code += `  event_data:\n`;
    code += generator.prefixLines(eventDataCode, '    ');
  }
  if (contextCode.trim()) {
    code += `  context:\n`;
    code += generator.prefixLines(contextCode, '    ');
  }
  return code;
};

function emitEventKvLine(block) {
  const key = String(block.getFieldValue('KEY') || '').trim();
  const rawValue = String(block.getFieldValue('VALUE') || '').trim();
  if (!key) return '';

  const lower = rawValue.toLowerCase();
  if (lower === 'true' || lower === 'false') {
    return `${key}: ${lower}\n`;
  }

  if (/^-?\d+(?:\.\d+)?$/.test(rawValue)) {
    const n = Number(rawValue);
    if (Number.isFinite(n)) return `${key}: ${n}\n`;
  }

  return `${key}: ${JSON.stringify(rawValue)}\n`;
}

yamlGenerator.forBlock['ha_event_kv'] = emitEventKvLine;
yamlGenerator.forBlock['ha_event_event_data_kv'] = emitEventKvLine;

yamlGenerator.forBlock['ha_event_event_data_call_service'] = function (block, generator) {
  const domainMode = String(block.getFieldValue('DOMAIN_MODE') || 'DROPDOWN');
  const serviceMode = String(block.getFieldValue('SERVICE_MODE') || 'DROPDOWN');
  const domain = String(
    domainMode === 'TEXT'
      ? (block.getFieldValue('DOMAIN_TEXT') || '')
      : (block.getFieldValue('DOMAIN') || '')
  ).trim();
  const service = String(
    serviceMode === 'TEXT'
      ? (block.getFieldValue('SERVICE_TEXT') || '')
      : (block.getFieldValue('SERVICE') || '')
  ).trim();
  const serviceCallId = String(block.getFieldValue('SERVICE_CALL_ID') || '').trim();
  const serviceDataCode = block.getInput('SERVICE_DATA')
    ? (generator.statementToCode(block, 'SERVICE_DATA') || '')
    : '';

  let code = '';
  if (domain) code += `domain: ${JSON.stringify(domain)}\n`;
  if (service) code += `service: ${JSON.stringify(service)}\n`;
  if (serviceCallId) code += `service_call_id: ${JSON.stringify(serviceCallId)}\n`;
  if (serviceDataCode.trim()) {
    code += `service_data:\n`;
    code += generator.prefixLines(serviceDataCode, '  ');
  }
  return code;
};

yamlGenerator.forBlock['ha_event_service_data_entity_id'] = function (block) {
  const mode = String(block.getFieldValue('ENTITY_MODE') || 'DROPDOWN');
  const value = String(
    mode === 'TEXT'
      ? (block.getFieldValue('VALUE') || '')
      : (block.getFieldValue('ENTITY_ID') || '')
  ).trim();
  if (!value) return '';
  return `entity_id: ${JSON.stringify(value)}\n`;
};

yamlGenerator.forBlock['ha_event_service_data_kv'] = emitEventKvLine;

yamlGenerator.forBlock['ha_event_context_kv'] = function (block) {
  const key = String(block.getFieldValue('CONTEXT_KEY') || '').trim();
  const rawValue = String(block.getFieldValue('VALUE') || '').trim();
  if (!key) return '';
  return `${key}: ${JSON.stringify(rawValue)}\n`;
};

yamlGenerator.forBlock['ha_event_mqtt'] = function (block, generator) {
  const topic = String(block.getFieldValue('TOPIC') || '').trim();
  if (!topic) return '';

  let code = `- trigger: mqtt\n`;
  code += `  topic: ${JSON.stringify(topic)}\n`;

  const optionsCode = block.getInput('OPTIONS')
    ? (generator.statementToCode(block, 'OPTIONS') || '')
    : '';
  if (optionsCode.trim()) {
    code += generator.prefixLines(optionsCode, '  ');
  }

  return code;
};

yamlGenerator.forBlock['ha_event_mqtt_payload'] = function (block) {
  const value = String(block.getFieldValue('VALUE') || '').trim();
  if (!value) return '';
  return `payload: ${JSON.stringify(value)}\n`;
};

yamlGenerator.forBlock['ha_event_mqtt_value_template'] = function (block) {
  const value = String(block.getFieldValue('VALUE') || '').trim();
  if (!value) return '';
  return `value_template: ${JSON.stringify(value)}\n`;
};

yamlGenerator.forBlock['ha_event_mqtt_encoding'] = function (block) {
  const mode = String(block.getFieldValue('MODE') || 'utf-8');
  if (mode === 'binary') return 'encoding: ""\n';
  if (mode === 'custom') {
    const custom = String(block.getFieldValue('CUSTOM') || '').trim();
    if (!custom) return '';
    return `encoding: ${JSON.stringify(custom)}\n`;
  }
  return `encoding: "utf-8"\n`;
};

function normalizeTemplateTriggerValue(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/\{\{[\s\S]*\}\}|\{%[\s\S]*%\}|\{#[\s\S]*#\}/.test(s)) return s;
  return `{{ ${s} }}`;
}

yamlGenerator.forBlock['ha_event_template'] = function (block, generator) {
  const normalized = normalizeTemplateTriggerValue(block.getFieldValue('TEMPLATE'));
  if (!normalized) return '';

  const forCode = generator.valueToCode(block, 'FOR', 0) || '';
  const useId = block.getFieldValue('USE_ID') === 'TRUE';
  const id = String(block.getFieldValue('ID') || '').trim();

  let code = `- trigger: template\n`;
  code += `  value_template: ${JSON.stringify(normalized)}\n`;
  if (forCode.trim()) code += `  for: ${forCode}\n`;
  if (useId && id) code += `  id: ${JSON.stringify(id)}\n`;
  return code;
};

/* ===== Conditions ===== */
function normalizeTemplateExpression(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return '';
  const m = s.match(/^\{\{\s*([\s\S]*?)\s*\}\}$/);
  if (m) s = m[1].trim();
  return s;
}

yamlGenerator.forBlock['condition_template'] = function (block) {
  const expr = normalizeTemplateExpression(block.getFieldValue('TEMPLATE'));
  if (!expr) return '';

  const escaped = expr.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const i = yamlGenerator.INDENT;
  const lines = [
    `- condition: template`,
    `${i}value_template: "{{ ${escaped} }}"`,
    '',
  ];
  return lines.join('\n');
};

// Condition: template (AND/OR/NOT group)
yamlGenerator.forBlock['condition_logic'] = function (block) {
  const logic = String(block.getFieldValue('LOGIC') || 'and').toLowerCase();
  const inner = yamlGenerator.statementToCode(block, 'SUBCONDITIONS') || '';
  if (!inner.trim()) return '';

  const i = yamlGenerator.INDENT;   // '  '
  const ii = i + i;
  const body = inner.trimEnd().replace(/^/gm, ii);

  return [
    `- condition: ${logic}`,
    `${i}conditions:`,
    body,
    ''
  ].join('\n');
};

yamlGenerator.forBlock['condition_not_value'] = function () {
  return ['NOT', Order.ATOMIC];
};

// Legacy compatibility: old saved workspaces may still contain this block.
yamlGenerator.forBlock['condition_not_inline'] = function (block) {
  const inner = yamlGenerator.statementToCode(block, 'SUBCONDITION') || '';
  if (!inner.trim()) return '';

  const i = yamlGenerator.INDENT;
  const ii = i + i;
  const body = inner.trimEnd().replace(/^/gm, ii);
  return [
    `- condition: not`,
    `${i}conditions:`,
    body,
    ''
  ].join('\n');
};

yamlGenerator.forBlock['condition_sun'] = function (block, generator) {
  const parts = [];
  let child = block.getInputTargetBlock('PARTS');
  while (child) {
    const chunk = String(generator.blockToCode(child, true) || '').trim();
    if (chunk) parts.push(chunk);
    child = child.getNextBlock();
  }

  if (!parts.length) return '';

  const body = parts.join('\n');
  const hasAfter = /(^|\n)after:\s*(sunrise|sunset)\b/.test(body);
  const hasBefore = /(^|\n)before:\s*(sunrise|sunset)\b/.test(body);
  if (!hasAfter && !hasBefore) return '';

  return `- condition: sun\n${generator.prefixLines(body + '\n', '  ')}\n`;
};

yamlGenerator.forBlock['condition_sun_after'] = function (block, generator) {
  const event = String(block.getFieldValue('EVENT') || '').trim();
  if (!event) return '';
  let code = `after: ${event}\n`;
  const offset = (generator.valueToCode(block, 'OFFSET', 0) || '').trim();
  if (offset) code += `after_offset: ${offset}\n`;
  return code;
};

yamlGenerator.forBlock['condition_sun_before'] = function (block, generator) {
  const event = String(block.getFieldValue('EVENT') || '').trim();
  if (!event) return '';
  let code = `before: ${event}\n`;
  const offset = (generator.valueToCode(block, 'OFFSET', 0) || '').trim();
  if (offset) code += `before_offset: ${offset}\n`;
  return code;
};

yamlGenerator.forBlock['condition_sun_offset'] = function (block) {
  const sign = (block.getFieldValue('SIGN') === '-') ? '-' : '+';
  let h = Math.max(0, Number(block.getFieldValue('H')) || 0);
  let m = Math.max(0, Number(block.getFieldValue('M')) || 0);
  let s = Math.max(0, Number(block.getFieldValue('S')) || 0);

  // Normalize 60-based carry so 00:60:00 => 01:00:00, 00:00:60 => 00:01:00
  h += Math.floor(m / 60);
  m = m % 60;
  m += Math.floor(s / 60);
  s = s % 60;
  h += Math.floor(m / 60);
  m = m % 60;

  const z2 = (n) => String(Math.floor(Math.max(0, n))).padStart(2, '0');
  h = z2(h);
  m = z2(m);
  s = z2(s);
  const hhmmss = `${h}:${m}:${s}`;
  if (h === '00' && m === '00' && s === '00') return ['', Order.ATOMIC];
  if (sign === '-') return [`"-${hhmmss}"`, Order.ATOMIC];
  return [`"${hhmmss}"`, Order.ATOMIC];
};

function quoteTimeOrEntity(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  return /^\d{2}:\d{2}:\d{2}$/.test(s) ? `"${s}"` : s;
}

function readConditionTimeSide(block, side) {
  const z2 = (n) => String(Math.max(0, Number(n) || 0)).padStart(2, '0');
  const mode = block.getFieldValue(`${side}_MODE`) || 'TIME';
  if (mode === 'ENTITY') {
    return String(block.getFieldValue(`${side}_ENTITY`) || '').trim();
  }
  return `${z2(block.getFieldValue(`${side}_H`))}:${z2(block.getFieldValue(`${side}_M`))}:${z2(block.getFieldValue(`${side}_S`))}`;
}

yamlGenerator.forBlock['condition_time'] = function (block) {
  const useAfter = block.getFieldValue('USE_AFTER') === 'TRUE';
  const useBefore = block.getFieldValue('USE_BEFORE') === 'TRUE';
  const after = useAfter ? readConditionTimeSide(block, 'AFTER') : '';
  const before = useBefore ? readConditionTimeSide(block, 'BEFORE') : '';
  if (!after && !before) return '';

  const lines = ['- condition: time'];
  if (after) lines.push(`  after: ${quoteTimeOrEntity(after)}`);
  if (before) lines.push(`  before: ${quoteTimeOrEntity(before)}`);
  lines.push('');
  return lines.join('\n');
};

yamlGenerator.forBlock['condition_time_weekly'] = function (block) {
  const weekdays = [];
  const map = [
    ['MON', 'mon'], ['TUE', 'tue'], ['WED', 'wed'], ['THU', 'thu'],
    ['FRI', 'fri'], ['SAT', 'sat'], ['SUN', 'sun'],
  ];
  for (const [f, d] of map) {
    if (block.getFieldValue(f) === 'TRUE') weekdays.push(d);
  }
  if (!weekdays.length) return '';

  const lines = ['- condition: time', '  weekday:'];
  for (const d of weekdays) lines.push(`    - ${d}`);
  lines.push('');
  return lines.join('\n');
};

yamlGenerator.forBlock['condition_time_after'] = function (block) {
  const z2 = (n) => String(Math.max(0, Number(n) || 0)).padStart(2, '0');
  const mode = block.getFieldValue('MODE') || 'TIME';
  const value = mode === 'ENTITY'
    ? String(block.getFieldValue('ENTITY_ID') || '').trim()
    : `${z2(block.getFieldValue('AFTER_H'))}:${z2(block.getFieldValue('AFTER_M'))}:${z2(block.getFieldValue('AFTER_S'))}`;
  if (!value) return '';
  return `- condition: time\n  after: ${quoteTimeOrEntity(value)}\n\n`;
};

yamlGenerator.forBlock['condition_time_before'] = function (block) {
  const z2 = (n) => String(Math.max(0, Number(n) || 0)).padStart(2, '0');
  const mode = block.getFieldValue('MODE') || 'TIME';
  const value = mode === 'ENTITY'
    ? String(block.getFieldValue('ENTITY_ID') || '').trim()
    : `${z2(block.getFieldValue('BEFORE_H'))}:${z2(block.getFieldValue('BEFORE_M'))}:${z2(block.getFieldValue('BEFORE_S'))}`;
  if (!value) return '';
  return `- condition: time\n  before: ${quoteTimeOrEntity(value)}\n\n`;
};

// Condition: entity state
yamlGenerator.forBlock['condition_state_cover'] = function (block) {
  const entityId = block.getFieldValue('ENTITY_ID') || '';
  if (!entityId) return '';

  const stateKind = block.getFieldValue('STATE_KIND') || 'open';
  const i = yamlGenerator.INDENT;
  const lines = [
    `- condition: state`,
    `${i}entity_id: ${entityId}`,
  ];

  if (stateKind === 'current_position') {
    const value = Number(block.getFieldValue('ATTR_NUMBER'));
    lines.push(`${i}attribute: current_position`);
    if (!Number.isNaN(value)) lines.push(`${i}state: ${value}`);
  } else if (stateKind === 'current_tilt_position') {
    const value = Number(block.getFieldValue('ATTR_NUMBER'));
    lines.push(`${i}attribute: current_tilt_position`);
    if (!Number.isNaN(value)) lines.push(`${i}state: ${value}`);
  } else if (stateKind === 'is_opening') {
    const value = block.getFieldValue('ATTR_BOOL') || 'true';
    lines.push(`${i}attribute: is_opening`);
    lines.push(`${i}state: ${value}`);
  } else if (stateKind === 'is_closing') {
    const value = block.getFieldValue('ATTR_BOOL') || 'true';
    lines.push(`${i}attribute: is_closing`);
    lines.push(`${i}state: ${value}`);
  } else if (stateKind === 'is_closed') {
    const value = block.getFieldValue('ATTR_BOOL') || 'true';
    lines.push(`${i}attribute: is_closed`);
    lines.push(`${i}state: ${value}`);
  } else {
    lines.push(`${i}state: '${String(stateKind)}'`);
  }

  lines.push('');
  return lines.join('\n');
};

yamlGenerator.forBlock['event_group_entities'] = function (block, generator) {
  const domain = String(block.getFieldValue('DOMAIN') || '').trim();
  if (!domain) return '';

  const from = block.getFieldValue('FROM') || '';
  const to = block.getFieldValue('TO') || '';
  const forValue = generator.valueToCode(block, 'FOR', 0) || '';
  const useId = block.getFieldValue('USE_ID') === 'TRUE';
  const id = String(block.getFieldValue('ID') || '').trim();

  const entities = [];
  let child = block.getInputTargetBlock('ENTITIES');
  while (child) {
    const hasEntityField = !!child.getField?.('ENTITY_ID');
    if (child.type === 'event_group_entity_item' || hasEntityField) {
      const eid = String(child.getFieldValue('ENTITY_ID') || '').trim();
      if (eid) entities.push(eid);
    }
    child = child.getNextBlock();
  }

  if (!entities.length) return '';

  const i = yamlGenerator.INDENT;
  const ii = i + i;
  const lines = [
    `- trigger: state`,
    `${i}entity_id:`,
  ];
  for (const eid of entities) {
    lines.push(`${ii}- ${eid}`);
  }
  if (from) lines.push(`${i}from: '${from}'`);
  if (to) lines.push(`${i}to: '${to}'`);
  if (forValue.trim()) lines.push(`${i}for: ${forValue}`);
  if (useId && id) lines.push(`${i}id: ${JSON.stringify(id)}`);
  lines.push('');
  return lines.join('\n');
};

yamlGenerator.forBlock['event_group_numeric_entities'] = function (block, generator) {
  const useAbove = block.getFieldValue('USE_ABOVE') === 'TRUE';
  const useBelow = block.getFieldValue('USE_BELOW') === 'TRUE';
  const above = Number(block.getFieldValue('ABOVE'));
  const below = Number(block.getFieldValue('BELOW'));
  const forValue = generator.valueToCode(block, 'FOR', 0) || '';
  const useId = block.getFieldValue('USE_ID') === 'TRUE';
  const id = String(block.getFieldValue('ID') || '').trim();

  if (!useAbove && !useBelow) return '';

  const entities = [];
  let child = block.getInputTargetBlock('ENTITIES');
  while (child) {
    const hasEntityField = !!child.getField?.('ENTITY_ID');
    if (child.type === 'event_group_entity_item' || hasEntityField) {
      const eid = String(child.getFieldValue('ENTITY_ID') || '').trim();
      if (eid) entities.push(eid);
    }
    child = child.getNextBlock();
  }
  if (!entities.length) return '';

  const i = yamlGenerator.INDENT;
  const ii = i + i;
  const lines = [
    `- trigger: numeric_state`,
    `${i}entity_id:`,
  ];
  for (const eid of entities) {
    lines.push(`${ii}- ${eid}`);
  }
  if (useAbove && !Number.isNaN(above)) lines.push(`${i}above: ${above}`);
  if (useBelow && !Number.isNaN(below)) lines.push(`${i}below: ${below}`);
  if (forValue.trim()) lines.push(`${i}for: ${forValue}`);
  if (useId && id) lines.push(`${i}id: ${JSON.stringify(id)}`);
  lines.push('');
  return lines.join('\n');
};

for (const domain of (STATE_DOMAINS || []).filter((d) => d !== 'cover')) {
  yamlGenerator.forBlock[`condition_state_${domain}`] = function (block) {
    const entityId = block.getFieldValue('ENTITY_ID') || '';
    const state    = block.getFieldValue('STATE') || '';
    if (!entityId) return '';
    const mod = (yamlGenerator.valueToCode(block, 'MOD', 0) || '').trim();
    const dataCode = block.getInput('DATA')
      ? (yamlGenerator.statementToCode(block, 'DATA') || '')
      : '';

    const i = yamlGenerator.INDENT;
    const lines = [
      `- condition: state`,
      `${i}entity_id: ${entityId}`,
    ];

    let attrText = '';
    let attrState = '';
    if (dataCode.trim()) {
      const dataLines = dataCode.split('\n');
      for (const l of dataLines) {
        const a = l.match(/^\s*attribute:\s*(.+)\s*$/);
        if (a) attrText = String(a[1] || '').trim();
        const s = l.match(/^\s*state:\s*(.+)\s*$/);
        if (s) {
          const raw = String(s[1] || '').trim();
          if (raw.startsWith('"') && raw.endsWith('"')) {
            try { attrState = JSON.parse(raw); } catch (_) { attrState = raw.slice(1, -1); }
          } else {
            attrState = raw;
          }
        }
      }
    }

    if (attrText) lines.push(`${i}attribute: ${attrText}`);
    if (attrState !== '') {
      lines.push(`${i}state: ${JSON.stringify(String(attrState))}`);
    } else if (state) {
      lines.push(`${i}state: '${String(state)}'`);
    }

    if (mod === 'NOT') {
      const ii = i + i;
      const nested = lines.join('\n').replace(/^/gm, ii);
      return [
        `- condition: not`,
        `${i}conditions:`,
        nested,
        ''
      ].join('\n');
    }

    lines.push('');
    return lines.join('\n');
  };
}

// Condition: numeric_state (entity)
yamlGenerator.forBlock['condition_numeric_state_entity'] = function (block) {
  const entityId = block.getFieldValue('ENTITY_ID') || '';
  const above = parseFloat(block.getFieldValue('ABOVE'));
  const below = parseFloat(block.getFieldValue('BELOW'));
  const hasUseAbove = !!block.getField('USE_ABOVE');
  const hasUseBelow = !!block.getField('USE_BELOW');
  const useAbove = hasUseAbove ? (block.getFieldValue('USE_ABOVE') === 'TRUE') : (!isNaN(above) && above > 0);
  const useBelow = hasUseBelow ? (block.getFieldValue('USE_BELOW') === 'TRUE') : (!isNaN(below) && below > 0);

  if (!entityId) return '';

  const i = yamlGenerator.INDENT;
  const lines = [
    `- condition: numeric_state`,
    `${i}entity_id: ${entityId}`
  ];

  if (useAbove && !isNaN(above)) lines.push(`${i}above: ${above}`);
  if (useBelow && !isNaN(below)) lines.push(`${i}below: ${below}`);

  lines.push('');
  return lines.join('\n');
};

// Condition: numeric_state (attribute)
yamlGenerator.forBlock['condition_numeric_state_attribute'] = function (block) {
  const entityId  = block.getFieldValue('ENTITY_ID') || '';
  const attribute = block.getFieldValue('ATTRIBUTE') || '';
  const above = parseFloat(block.getFieldValue('ABOVE'));
  const below = parseFloat(block.getFieldValue('BELOW'));
  const hasUseAbove = !!block.getField('USE_ABOVE');
  const hasUseBelow = !!block.getField('USE_BELOW');
  const useAbove = hasUseAbove ? (block.getFieldValue('USE_ABOVE') === 'TRUE') : (!isNaN(above) && above > 0);
  const useBelow = hasUseBelow ? (block.getFieldValue('USE_BELOW') === 'TRUE') : (!isNaN(below) && below > 0);

  if (!entityId || !attribute) return '';

  const i = yamlGenerator.INDENT;
  const lines = [
    `- condition: numeric_state`,
    `${i}entity_id: ${entityId}`,
    `${i}attribute: ${attribute}`
  ];

  if (useAbove && !isNaN(above)) lines.push(`${i}above: ${above}`);
  if (useBelow && !isNaN(below)) lines.push(`${i}below: ${below}`);

  lines.push('');
  return lines.join('\n');
};

/* ===== Actions ===== */
// Action: delay
yamlGenerator.forBlock['action_delay'] = function (block) {
  const h = Math.max(0, Number(block.getFieldValue('H') || 0));
  const m = Math.max(0, Number(block.getFieldValue('M') || 0));
  const s = Math.max(0, Number(block.getFieldValue('S') || 0));

  const z2 = (n) => String(n).padStart(2, '0');
  const hhmmss = `${z2(h)}:${z2(m)}:${z2(s)}`;

  let code = `- delay: "${hhmmss}"\n\n`;
  return code;
};

yamlGenerator.forBlock['action_mqtt_publish'] = function (block, generator) {
  const topic = String(block.getFieldValue('TOPIC') || '').trim();
  if (!topic) return '';

  const lines = [
    '- action: mqtt.publish',
    '  data:',
    `    topic: ${JSON.stringify(topic)}`,
  ];

  const dataCode = block.getInput('DATA')
    ? (generator.statementToCode(block, 'DATA') || '')
    : '';
  if (dataCode.trim()) {
    lines.push(generator.prefixLines(dataCode, '    ').trimEnd());
  }

  lines.push('');
  return lines.join('\n');
};

yamlGenerator.forBlock['action_mqtt_payload_text'] = function (block) {
  const payloadRaw = String(block.getFieldValue('PAYLOAD') || '');
  const payload = payloadRaw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!payload.includes('\n')) {
    return `payload: ${JSON.stringify(payload)}\n`;
  }
  const body = payload.split('\n').map((line) => `  ${line}`).join('\n');
  return `payload: |-\n${body}\n`;
};

yamlGenerator.forBlock['action_mqtt_qos'] = function (block) {
  const raw = String(block.getFieldValue('QOS') || '0').trim();
  const qos = raw === '1' || raw === '2' ? raw : '0';
  return `qos: ${qos}\n`;
};

yamlGenerator.forBlock['action_mqtt_retain'] = function (block) {
  const v = String(block.getFieldValue('RETAIN') || 'false').toLowerCase() === 'true';
  return `retain: ${v ? 'true' : 'false'}\n`;
};

yamlGenerator.forBlock['action_mqtt_evaluate_payload'] = function (block) {
  const v = String(block.getFieldValue('EVAL') || 'false').toLowerCase() === 'true';
  return `evaluate_payload: ${v ? 'true' : 'false'}\n`;
};

yamlGenerator.forBlock['action_mqtt_data_kv'] = function (block) {
  const key = String(block.getFieldValue('KEY') || '').trim();
  const rawValue = String(block.getFieldValue('VALUE') || '');
  if (!key) return '';
  if (key.toLowerCase() === 'topic') return '';

  const trimmed = rawValue.trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'true' || lower === 'false') {
    return `${key}: ${lower}\n`;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isFinite(n)) return `${key}: ${n}\n`;
  }

  return `${key}: ${JSON.stringify(rawValue)}\n`;
};

// Action: entity
const ALLOW_ACTION_WITHOUT_TARGET_DOMAINS = new Set([
  'mqtt',
]);

function isTargetOptionalAction(domain, action) {
  const d = String(domain || '').trim();
  const a = String(action || '').trim();
  if (!d || !a) return false;

  if (d === 'backup' && a === 'create') return true;
  if (d === 'persistent_notification' && a === 'dismiss') return true;
  if (d === 'unifi' && a === 'reconnect_client') return true;
  if (d === 'homeassistant' && a === 'reload_config_entry') return true;
  return false;
}

for (const domain of (ACTION_DOMAINS || [])) {
  yamlGenerator.forBlock[`action_${domain}`] = function (block, generator) {
    const rawEntity = block.getFieldValue('ENTITY_ID') || '';
    const isTemplateEntity = rawEntity === '__template__';
    const entityId = isTemplateEntity
      ? String(block.getFieldValue('TEMPLATE_ENTITY') || '').trim()
      : rawEntity;
    const action = block.getFieldValue('ACTION') || '';
    if (!action) return '';

    const i = yamlGenerator.INDENT;
    const ii = i + i;
    const requiresTarget = !ALLOW_ACTION_WITHOUT_TARGET_DOMAINS.has(domain);
    if (
      requiresTarget &&
      domain !== 'ecobee' &&
      !entityId &&
      !isTargetOptionalAction(domain, action)
    ) {
      return '';
    }

    const lines = [];
    lines.push(`- action: ${domain}.${action}`);
    if (domain === 'ecobee') {
      lines.push(`${i}data:`);
      lines.push(`${ii}entity_id: ${isTemplateEntity ? JSON.stringify(entityId) : entityId}`);
    } else if (entityId) {
      lines.push(`${i}target:`);
      lines.push(`${ii}entity_id: ${isTemplateEntity ? JSON.stringify(entityId) : entityId}`);
    }

    const dataCode = block.getInput('DATA')
      ? generator.statementToCode(block, 'DATA')
      : '';

    if (dataCode.trim()) {
      if (domain === 'ecobee') {
        lines.push(generator.prefixLines(dataCode, i));
      } else {
        lines.push(`${i}data:`);
        // statementToCode already includes one indent level for child statements.
        // Use one more level here so data children stay at +2 from `data:`.
        lines.push(generator.prefixLines(dataCode, i));
      }
    }

    lines.push('');
    return lines.join('\n');
  };
}

function normalizeScriptEntityActionValue(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/\{\{[\s\S]*\}\}|\{%[\s\S]*%\}|\{#[\s\S]*#\}/.test(s)) return s;
  if (s.startsWith('script.')) return s;
  return `script.${s}`;
}

function normalizePythonScriptActionValue(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('python_script.')) s = s.slice('python_script.'.length);
  if (!s) return '';
  return `python_script.${s}`;
}

function getScriptTargetEntityValue(block) {
  const selected = String(
    block.getFieldValue('ENTITY_ID') || block.entityId_ || ''
  ).trim();
  if (!selected) return '';
  if (selected === '__custom__') {
    return normalizeScriptEntityActionValue(
      block.getFieldValue('ENTITY_TEXT') || block.entityText_ || ''
    );
  }
  return normalizeScriptEntityActionValue(selected);
}

yamlGenerator.forBlock['action_script_call'] = function (block, generator) {
  const mode = String(block.getFieldValue('MODE') || block.mode_ || 'entity');
  let actionName = '';

  if (mode === 'service') {
    const service = String(
      block.getFieldValue('SERVICE') || block.service_ || 'turn_on'
    ).trim();
    actionName = `script.${service}`;
  } else if (mode === 'python') {
    actionName = normalizePythonScriptActionValue(
      block.getFieldValue('PYTHON_NAME') || block.pythonName_ || 'main_floor_roomba'
    );
  } else {
    actionName = normalizeScriptEntityActionValue(getScriptTargetEntityValue(block));
  }

  if (!actionName) {
    if (mode === 'python') {
      actionName = 'python_script.main_floor_roomba';
    } else if (mode === 'service') {
      actionName = 'script.turn_on';
    } else {
      actionName = 'script.my_script';
    }
  }

  const targetIds = [];
  let child = block.getInputTargetBlock('TARGET');
  while (child) {
    if (child.type === 'action_script_target_entity') {
      const eid = getScriptTargetEntityValue(child);
      if (eid) targetIds.push(eid);
    }
    child = child.getNextBlock();
  }

  const i = yamlGenerator.INDENT;
  const ii = i + i;
  const lines = [`- action: ${actionName}`];

  if (targetIds.length === 1) {
    lines.push(`${i}target:`);
    lines.push(`${ii}entity_id: ${targetIds[0]}`);
  } else if (targetIds.length > 1) {
    lines.push(`${i}target:`);
    lines.push(`${ii}entity_id:`);
    for (const eid of targetIds) {
      lines.push(`${ii}${i}- ${eid}`);
    }
  }

  const dataCode = block.getInput('DATA')
    ? generator.statementToCode(block, 'DATA')
    : '';
  if (dataCode.trim()) {
    lines.push(`${i}data:`);
    lines.push(generator.prefixLines(dataCode, i));
  }

  lines.push('');
  return lines.join('\n');
};

yamlGenerator.forBlock['action_script_target_entity'] = function () {
  return '';
};

yamlGenerator.forBlock['condition_data_attribute'] = function (block) {
  const v = String(block.getFieldValue('VALUE') || '').trim();
  if (!v) return '';
  return `attribute: ${v}\n`;
};

yamlGenerator.forBlock['condition_data_state'] = function (block) {
  const v = String(block.getFieldValue('VALUE') || '');
  return `state: ${JSON.stringify(v)}\n`;
};

yamlGenerator.forBlock['action_data_brightness_pct'] = function (block) {
  const v = Number(block.getFieldValue('VALUE') || 0);
  return `brightness_pct: ${v}\n`;
};

yamlGenerator.forBlock['action_data_transition'] = function (block) {
  const v = Number(block.getFieldValue('SECONDS') || 0);
  return `transition: ${v}\n`;
};

yamlGenerator.forBlock['action_data_color'] = function (block) {
  const mode = String(block.getFieldValue('MODE') || 'name');

  if (mode === 'rgb') {
    const r = Math.max(0, Math.min(255, Math.round(Number(block.getFieldValue('R') || 0))));
    const g = Math.max(0, Math.min(255, Math.round(Number(block.getFieldValue('G') || 0))));
    const b = Math.max(0, Math.min(255, Math.round(Number(block.getFieldValue('B') || 0))));
    return `rgb_color: [${r}, ${g}, ${b}]\n`;
  }

  const name = String(block.getFieldValue('NAME') || '').trim();
  if (!name) return '';
  return `color_name: ${JSON.stringify(name)}\n`;
};

yamlGenerator.forBlock['action_data_effect'] = function (block) {
  const effect = String(block.getFieldValue('EFFECT') || '').trim();
  if (!effect) return '';
  return `effect: ${JSON.stringify(effect)}\n`;
};

yamlGenerator.forBlock['action_data_announce'] = function (block) {
  const v = String(block.getFieldValue('VALUE') || 'false') === 'true';
  return `announce: ${v ? 'true' : 'false'}\n`;
};

yamlGenerator.forBlock['action_data_media_content_type'] = function (block) {
  const v = String(block.getFieldValue('VALUE') || '').trim();
  if (!v) return '';
  return `media_content_type: ${JSON.stringify(v)}\n`;
};

yamlGenerator.forBlock['action_data_climate_preset_mode'] = function (block) {
  const v = String(block.getFieldValue('VALUE') || '').trim();
  if (!v) return '';
  return `preset_mode: ${JSON.stringify(v)}\n`;
};

function emitYamlScalar(v) {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v == null) return 'null';
  return JSON.stringify(String(v));
}

function emitYamlObject(obj, indent = 0) {
  const pad = ' '.repeat(indent);
  let out = '';
  for (const [k, v] of Object.entries(obj || {})) {
    if (Array.isArray(v)) {
      out += `${pad}${k}:\n`;
      for (const item of v) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          out += `${pad}  -\n`;
          out += emitYamlObject(item, indent + 4);
        } else {
          out += `${pad}  - ${emitYamlScalar(item)}\n`;
        }
      }
      continue;
    }
    if (v && typeof v === 'object') {
      out += `${pad}${k}:\n`;
      out += emitYamlObject(v, indent + 2);
      continue;
    }
    out += `${pad}${k}: ${emitYamlScalar(v)}\n`;
  }
  return out;
}

yamlGenerator.forBlock['action_data_kv_text'] = function (block) {
  const k = (block.getFieldValue('KEY') || '').trim();
  const rawV = String(block.getFieldValue('VALUE') || '');
  const v = rawV.trim();
  if (!k) return '';
  const keyLower = k.toLowerCase();

  if (keyLower === 'position') {
    const n = Number(v);
    if (!Number.isFinite(n)) return '';
    const iv = Math.round(n);
    if (iv < 0 || iv > 100) return '';
    return `position: ${iv}\n`;
  }

  const numericKeys = new Set([
    'brightness_pct',
    'transition',
    'temperature',
    'target_temp_high',
    'target_temp_low',
    'humidity',
    'volume_level',
  ]);
  if (numericKeys.has(keyLower)) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '';
    return `${k}: ${n}\n`;
  }

  if (keyLower === 'media_content_id') {
    let mediaValue = rawV.replace(/\r\n/g, '\n').trim();
    if (mediaValue.startsWith('>')) {
      mediaValue = mediaValue.slice(1).trim();
    }
    if ((mediaValue.startsWith("'media-source://") || mediaValue.startsWith('"media-source://'))) {
      mediaValue = mediaValue.slice(1).trim();
    }
    for (let i = 0; i < 3; i += 1) {
      const prev = mediaValue;
      mediaValue = mediaValue
        .replace(/\\\\\"/g, '\\"')
        .replace(/\\"/g, '"')
        .replace(/\\\\n/g, '\\n');
      if (mediaValue === prev) break;
    }
    mediaValue = mediaValue.replace(/\\n/g, '\n');

    if (!mediaValue) return `${k}: ""\n`;

    const lines = mediaValue.split('\n');
    let out = `${k}: |-\n`;
    lines.forEach((line) => {
      out += `  ${line}\n`;
    });
    return out;
  }

  if (keyLower === 'hs_color') {
    const splitInlineArray = (inner) => {
      const out = [];
      let cur = '';
      let quote = '';
      let escape = false;
      let depthParen = 0;
      let depthBracket = 0;
      let depthBrace = 0;

      for (let i = 0; i < inner.length; i += 1) {
        const ch = inner[i];
        if (escape) {
          cur += ch;
          escape = false;
          continue;
        }
        if (ch === '\\') {
          cur += ch;
          escape = true;
          continue;
        }
        if (quote) {
          cur += ch;
          if (ch === quote) quote = '';
          continue;
        }
        if (ch === '"' || ch === "'") {
          quote = ch;
          cur += ch;
          continue;
        }
        if (ch === '(') depthParen += 1;
        else if (ch === ')' && depthParen > 0) depthParen -= 1;
        else if (ch === '[') depthBracket += 1;
        else if (ch === ']' && depthBracket > 0) depthBracket -= 1;
        else if (ch === '{') depthBrace += 1;
        else if (ch === '}' && depthBrace > 0) depthBrace -= 1;

        if (ch === ',' && depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
          const token = cur.trim();
          if (token) out.push(token);
          cur = '';
          continue;
        }
        cur += ch;
      }

      const tail = cur.trim();
      if (tail) out.push(tail);
      return out;
    };

    const unquote = (s) => {
      const t = String(s ?? '').trim();
      if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
        return t.slice(1, -1);
      }
      return t;
    };

    const parseHsColor = (raw) => {
      const t = String(raw ?? '').trim();
      if (!t) return null;
      if (Array.isArray(raw)) return raw;

      const tryJson = (x) => {
        try {
          const parsed = JSON.parse(x);
          if (Array.isArray(parsed) && parsed.length >= 2) return parsed;
        } catch (_) {}
        return null;
      };

      let arr = tryJson(t);
      if (arr) return arr;

      // 문자열 전체가 다시 한번 인용된 경우
      const stripped = unquote(t);
      arr = tryJson(stripped);
      if (arr) return arr;

      if (stripped.startsWith('[') && stripped.endsWith(']')) {
        const inner = stripped.slice(1, -1).trim();
        if (!inner) return null;
        return splitInlineArray(inner).map((x) => unquote(x));
      }

      return null;
    };

    const arr = parseHsColor(v);
    if (Array.isArray(arr) && arr.length >= 2) {
      const toScalar = (x) => {
        const n = Number(x);
        if (Number.isFinite(n) && String(x).trim() !== '') return String(n);
        return JSON.stringify(String(x ?? ''));
      };
      return `${k}:\n  - ${toScalar(arr[0])}\n  - ${toScalar(arr[1])}\n`;
    }
  }

  if (keyLower === 'payload') {
    let text = String(v || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // payload에서 자주 발생하는 escape 오염 최소 정리
    text = text
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\n')
      .replace(/''/g, "'")
      .replace(/"\s*\\\s*:/g, '":');

    const body = text.split('\n').map((line) => `  ${line}`).join('\n');
    return `${k}: >-\n${body}\n`;
  }

  if (keyLower === 'extra') {
    try {
      const parsed = JSON.parse(v || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return `${k}:\n${emitYamlObject(parsed, 2)}`;
      }
    } catch (_) {
      // fall through to text
    }
  }

  return `${k}: ${JSON.stringify(v)}\n`;
};

// Action: if-then-else
function indentAll(s, pad) {
  if (!s) return '';
  return s.trimEnd().replace(/^/gm, pad) + '\n';
}

yamlGenerator.forBlock['action_if_else'] = function (block) {
  const i  = yamlGenerator.INDENT;      // '  '
  const ii = i + i;

  const ifConds = yamlGenerator.statementToCode(block, 'IF')   || '';
  const thenSeq = yamlGenerator.statementToCode(block, 'THEN') || '';
  const elseSeq = yamlGenerator.statementToCode(block, 'ELSE') || '';

  if (!ifConds.trim() || !thenSeq.trim()) return '';

  const lines = [];
  lines.push(`- choose:`);
  lines.push(`${i}- conditions:`);          // choose 항목 (when) 시작
  lines.push(indentAll(ifConds, ii));       // 조건 리스트(각 줄은 "- ..." 형태) → ii 들여쓰기
  lines.push(`${ii}sequence:`);             // sequence는 conditions와 같은 깊이
  lines.push(indentAll(thenSeq, ii));       // 액션 리스트 → ii 들여쓰기

  if (elseSeq.trim()) {
    lines.push(`${i}default:`);             // default도 i 깊이
    lines.push(indentAll(elseSeq, ii));     // 액션 리스트 → ii 들여쓰기
  }

  lines.push('');
  return lines.join('\n');
};

// Action: if-then
yamlGenerator.forBlock['action_if_then'] = function (block) {
  const i  = yamlGenerator.INDENT;
  const ii = i + i;

  const ifConds = yamlGenerator.statementToCode(block, 'IF')   || '';
  const thenSeq = yamlGenerator.statementToCode(block, 'THEN') || '';

  if (!ifConds.trim() || !thenSeq.trim()) return '';

  const lines = [];
  lines.push(`- choose:`);
  lines.push(`${i}- conditions:`);
  lines.push(indentAll(ifConds, ii));
  lines.push(`${i}sequence:`);
  lines.push(indentAll(thenSeq, ii));
  lines.push('');
  return lines.join('\n');
};

// Action: notify
yamlGenerator.forBlock['action_notify'] = function (block, generator) {
  const uiTarget = (block.getFieldValue('TARGET') || 'notify').trim();
  const svc = uiTarget.startsWith('notify.') ? uiTarget : `notify.${uiTarget}`;

  const extraLines = [];
  const messageParts = [];
  const mergePushOptionBlock = (pushBlock, pushPayload, state) => {
    const option = String(pushBlock.getFieldValue('OPTION') || 'none');
    state.seen = true;
    if (option === 'none') {
      state.seenNull = true;
      return;
    }

    if (option === 'badge') {
      const n = Number(pushBlock.getFieldValue('BADGE'));
      if (Number.isFinite(n)) pushPayload.badge = n;
      return;
    }

    if (option === 'interruption_level') {
      const lvl = String(pushBlock.getFieldValue('INTERRUPTION_LEVEL') || '').trim();
      if (lvl) pushPayload['interruption-level'] = lvl;
      return;
    }

    if (option === 'sound') {
      const mode = String(pushBlock.getFieldValue('SOUND_MODE') || 'text');
      if (mode === 'default' || mode === 'none') {
        pushPayload.sound = mode;
        return;
      }
      if (mode === 'critical') {
        const name = String(pushBlock.getFieldValue('SOUND_NAME') || 'default').trim() || 'default';
        const critical = Number(pushBlock.getFieldValue('SOUND_CRITICAL'));
        const volume = Number(pushBlock.getFieldValue('SOUND_VOLUME'));
        const soundObj = { name };
        if (Number.isFinite(critical)) soundObj.critical = critical;
        if (Number.isFinite(volume)) soundObj.volume = volume;
        pushPayload.sound = soundObj;
        return;
      }
      const text = String(pushBlock.getFieldValue('SOUND_TEXT') || '').trim();
      if (text) pushPayload.sound = text;
      return;
    }
  };

  const mergeLegacyPushBlock = (pushBlock, pushPayload, state) => {
    state.seen = true;
    const kind = (pushBlock.getFieldValue('PUSH_KIND') || '').trim();
    if (!kind) return;

    if (kind === 'sound') {
      const sound = {};
      let p = pushBlock.getInputTargetBlock('PUSH_BLOCKS');
      while (p) {
        if (p.type === 'notify_push_name') {
          const n = (p.getFieldValue('NAME') || '').trim();
          if (n) sound.name = n;
        } else if (p.type === 'notify_push_critical') {
          const critical = Number(p.getFieldValue('CRITICAL'));
          const volume = Number(p.getFieldValue('VOLUME'));
          if (!Number.isNaN(critical)) sound.critical = critical;
          if (!Number.isNaN(volume)) sound.volume = volume;
        }
        p = p.getNextBlock();
      }
      if (!Object.keys(sound).length) return;
      pushPayload.sound = sound;
      return;
    }

    if (kind === 'badge') {
      let badge = null;
      let p = pushBlock.getInputTargetBlock('PUSH_BLOCKS');
      while (p) {
        if (p.type === 'notify_push_critical') {
          const n = Number(p.getFieldValue('CRITICAL'));
          if (!Number.isNaN(n)) badge = n;
          break;
        }
        p = p.getNextBlock();
      }
      if (badge != null) pushPayload.badge = badge;
    }
  };

  const emitPushYaml = (pushPayload, state) => {
    if (!state.seen) return '';
    if (!Object.keys(pushPayload).length) {
      return state.seenNull ? `push: null\n` : '';
    }

    let y = `push:\n`;
    if (pushPayload.sound !== undefined) {
      if (typeof pushPayload.sound === 'string') {
        y += `  sound: ${JSON.stringify(pushPayload.sound)}\n`;
      } else if (pushPayload.sound && typeof pushPayload.sound === 'object') {
        y += `  sound:\n`;
        if (pushPayload.sound.name != null) y += `    name: ${String(pushPayload.sound.name)}\n`;
        if (pushPayload.sound.critical != null) y += `    critical: ${pushPayload.sound.critical}\n`;
        if (pushPayload.sound.volume != null) y += `    volume: ${pushPayload.sound.volume}\n`;
      }
    }
    if (pushPayload.badge !== undefined) y += `  badge: ${pushPayload.badge}\n`;
    if (pushPayload['interruption-level'] !== undefined) y += `  interruption-level: ${pushPayload['interruption-level']}\n`;
    return y;
  };

  const buildPushYaml = (pushBlock) => {
    // Legacy support only (notify_push / notify_push_name / notify_push_critical).
    // New block format is merged in main traversal via mergePushOptionBlock.
    const kind = (pushBlock.getFieldValue('PUSH_KIND') || '').trim();
    if (!kind) return '';

    if (kind === 'sound') {
      const sound = {};
      let p = pushBlock.getInputTargetBlock('PUSH_BLOCKS');
      while (p) {
        if (p.type === 'notify_push_name') {
          const n = (p.getFieldValue('NAME') || '').trim();
          if (n) sound.name = n;
        } else if (p.type === 'notify_push_critical') {
          const critical = Number(p.getFieldValue('CRITICAL'));
          const volume = Number(p.getFieldValue('VOLUME'));
          if (!Number.isNaN(critical)) sound.critical = critical;
          if (!Number.isNaN(volume)) sound.volume = volume;
        }
        p = p.getNextBlock();
      }
      if (!Object.keys(sound).length) return '';
      let y = `push:\n`;
      y += `  sound:\n`;
      if (sound.name != null) y += `    name: ${String(sound.name)}\n`;
      if (sound.critical != null) y += `    critical: ${sound.critical}\n`;
      if (sound.volume != null) y += `    volume: ${sound.volume}\n`;
      return y;
    }

    if (kind === 'badge') {
      let badge = null;
      let p = pushBlock.getInputTargetBlock('PUSH_BLOCKS');
      while (p) {
        if (p.type === 'notify_push_critical') {
          const n = Number(p.getFieldValue('CRITICAL'));
          if (!Number.isNaN(n)) badge = n;
          break;
        }
        p = p.getNextBlock();
      }
      if (badge == null) return '';
      let y = `push:\n`;
      y += `  badge: ${badge}\n`;
      return y;
    }

    return '';
  };

  let child = block.getInputTargetBlock('MESSAGE_BLOCKS');
  const pushPayload = {};
  const pushState = { seen: false, seenNull: false };
  while (child) {
    if (child.type === 'action_notify_message_text') {
      const t = String(child.getFieldValue('TEXT') || '');
      if (t && t !== 'input message') messageParts.push(t);
    }
    if (child.type === 'action_notify_message_template') {
      const kind = String(child.getFieldValue('TEMPLATE_KIND') || '');
      const map = {
        TRIGGER_ENTITY_ID: ' {{ trigger.entity_id }} ',
        TRIGGER_FRIENDLY_NAME: ' {{ trigger.to_state.attributes.friendly_name }} ',
        TRIGGER_NEW_STATE: ' {{ trigger.to_state.state }} ',
        TRIGGER_OLD_STATE: ' {{ trigger.from_state.state }} ',
        NOW: ' {{ now() }} ',
        DATE: ' {{ now().date() }} ',
        TIME_HM: " {{ now().strftime('%H:%M') }} ",
        WEEKDAY: " {{ now().strftime('%A') }} ",
        USER_NAME: ' {{ user.name }} ',
        USER_LANG: ' {{ user.language }} ',
        USER_ID: ' {{ user.id }} ',
      };
      if (map[kind]) messageParts.push(map[kind]);
    }
    if (child.type === 'action_message') {
      let inner = child.getInputTargetBlock('MESSAGE_BLOCKS');
      while (inner) {
        if (inner.type === 'action_notify_message_text') {
          const t = String(inner.getFieldValue('TEXT') || '');
          if (t && t !== 'input message') messageParts.push(t);
        }
        if (inner.type === 'action_notify_message_template') {
          const kind = String(inner.getFieldValue('TEMPLATE_KIND') || '');
          const map = {
            TRIGGER_ENTITY_ID: ' {{ trigger.entity_id }} ',
            TRIGGER_FRIENDLY_NAME: ' {{ trigger.to_state.attributes.friendly_name }} ',
            TRIGGER_NEW_STATE: ' {{ trigger.to_state.state }} ',
            TRIGGER_OLD_STATE: ' {{ trigger.from_state.state }} ',
            NOW: ' {{ now() }} ',
            DATE: ' {{ now().date() }} ',
            TIME_HM: " {{ now().strftime('%H:%M') }} ",
            WEEKDAY: " {{ now().strftime('%A') }} ",
            USER_NAME: ' {{ user.name }} ',
            USER_LANG: ' {{ user.language }} ',
            USER_ID: ' {{ user.id }} ',
          };
          if (map[kind]) messageParts.push(map[kind]);
        }
        if (inner.type === 'action_notify_tag') {
          const fn = generator.forBlock['action_notify_tag'];
          if (fn) {
            const tagYaml = fn(inner, generator);
            if (tagYaml) extraLines.push(tagYaml);
          }
        }
        inner = inner.getNextBlock();
      }
    }
    if (child.type === 'action_notify_tag') {
      const fn = generator.forBlock['action_notify_tag'];
      if (fn) {
        const tagYaml = fn(child, generator);
        if (tagYaml) extraLines.push(tagYaml);
      }
    }
    if (child.type === 'notify_push') {
      mergeLegacyPushBlock(child, pushPayload, pushState);
      const pushYaml = buildPushYaml(child);
      if (pushYaml && !Object.keys(pushPayload).length) extraLines.unshift(pushYaml);
    }
    if (child.type === 'notify_push_option') {
      mergePushOptionBlock(child, pushPayload, pushState);
    }
    child = child.getNextBlock();
  }

  const mergedPushYaml = emitPushYaml(pushPayload, pushState);
  if (mergedPushYaml) extraLines.unshift(mergedPushYaml);

  const message = messageParts.join('');
  if (!message) return '';

  let code = `- action: ${svc}\n`;
  code += `  data:\n`;
  code += `    message: ${JSON.stringify(message)}\n`;
  if (extraLines.length) {
    code += `    data:\n`;
    for (const l of extraLines) {
      code += generator.prefixLines(l, '      ');
    }
  }
  return code;
};

yamlGenerator.forBlock['action_message'] = function () { return ''; };
yamlGenerator.forBlock['action_notify_message_text'] = function () { return ''; };
yamlGenerator.forBlock['action_notify_message_template'] = function () { return ''; };

// Notify Tag Payload: data.data(...)
yamlGenerator.forBlock['action_notify_tag'] = function (block, generator) {
  const tagName = (block.getFieldValue('TAG_NAME') || '').trim();

  // TAG_BLOCKS 체인에서 값 수집
  let entityId = '';
  const actions = [];
  let currentAction = null;
  let child = block.getInputTargetBlock('TAG_BLOCKS');
  while (child) {
    switch (child.type) {
      case 'notify_tag': {
        const eid = (child.getFieldValue('ENTITY_ID') || '').trim();
        if (eid) entityId = eid; // overwrite
        break;
      }
      case 'notify_action': {
        const aid = (child.getFieldValue('ACTION_ID') || '').trim();
        if (aid) {
          currentAction = { action: aid };
          actions.push(currentAction);
        } else {
          currentAction = null;
        }
        break;
      }
      case 'notify_prop_title': {
        const t = (child.getFieldValue('TITLE') || '').trim();
        if (t && currentAction) currentAction.title = t;
        break;
      }
      case 'notify_prop_destructive': {
        const v = (child.getFieldValue('DESTRUCTIVE') === 'true');
        if (currentAction) currentAction.destructive = v;
        break;
      }
      case 'notify_prop_activationMode': {
        const m = (child.getFieldValue('MODE') || '').trim();
        if (m && currentAction) currentAction.activationMode = m;
        break;
      }
      default:
        break;
    }
    child = child.getNextBlock();
  }

  // 아무 내용도 없으면 출력 X
  const hasAny = (tagName || entityId || actions.length > 0);
  if (!hasAny) return '';

  // notify의 data.data(payload) 본문만 반환한다.
  let code = ``;
  if (tagName) code += `tag: ${JSON.stringify(tagName)}\n`;
  if (entityId) code += `entity_id: ${entityId}\n`;

  if (actions.length > 0) {
    code += `actions:\n`;
    for (const a of actions) {
      code += `  - action: ${JSON.stringify(a.action)}\n`;
      if (a.title) code += `    title: ${JSON.stringify(a.title)}\n`;
      if (typeof a.destructive === 'boolean') code += `    destructive: ${a.destructive ? 'true' : 'false'}\n`;
      if (a.activationMode) code += `    activationMode: ${a.activationMode}\n`;
    }
  }

  return code;
};
yamlGenerator.forBlock['notify_push'] = function () { return ''; };
yamlGenerator.forBlock['notify_push_name'] = function () { return ''; };
yamlGenerator.forBlock['notify_push_critical'] = function () { return ''; };
yamlGenerator.forBlock['notify_push_option'] = function () { return ''; };

/* --- Props: button properties --- */
yamlGenerator.forBlock['notify_prop_title'] = function (block) {
  const title = (block.getFieldValue('TITLE') || '').trim();
  if (!title) return '';
  return `title: ${JSON.stringify(title)}\n`;
};

yamlGenerator.forBlock['notify_prop_destructive'] = function (block) {
  const v = (block.getFieldValue('DESTRUCTIVE') === 'true') ? 'true' : 'false';
  return `destructive: ${v}\n`;
};

yamlGenerator.forBlock['notify_prop_activationMode'] = function (block) {
  const mode = (block.getFieldValue('MODE') || 'background').trim();
  if (!mode) return '';
  return `activationMode: ${mode}\n`;
};

// Action Group: action_group_entities
yamlGenerator.forBlock['action_group_entities'] = function (block) {
  // 1) 도메인(light/cover) + 서비스(open_cover / turn_on 등) 읽기
  const domain = block.getFieldValue('DOMAIN') || 'cover';
  const serviceSuffix = block.getFieldValue('SERVICE') || '';
  const service = serviceSuffix ? `${domain}.${serviceSuffix}` : domain;

  // 2) 하위 entity 블록들을 순회하면서 entity_id 수집
  const entities = [];
  let child = block.getInputTargetBlock('ENTITIES');
  while (child) {
    const eid = child.getFieldValue('ENTITY_ID');
    if (eid) {
      entities.push(eid);   // '-'(value:'')는 자동으로 건너뜀
    }
    child = child.getNextBlock();
  }

  // 엔티티가 하나도 없으면 아무 것도 생성하지 않도록 처리
  if (entities.length === 0) {
    return '';
  }

  const dataCode = block.getInput('DATA')
    ? yamlGenerator.statementToCode(block, 'DATA')
    : '';

  // 3) YAML 문자열 생성
  let yaml = `- action: ${service}\n`;
  yaml += '  target:\n';
  yaml += '    entity_id:\n';
  for (const eid of entities) {
    yaml += `      - ${eid}\n`;
  }
  if (dataCode.trim()) {
    yaml += '  data:\n';
    // statementToCode already includes one indent level for child statements.
    // Keep data children at +2 from `data:`.
    yaml += yamlGenerator.prefixLines(dataCode, '  ');
  }

  return yaml + '\n';
};

yamlGenerator.forBlock['action_join'] = function (block, generator) {
  const domain = String(block.getFieldValue('DOMAIN') || '').trim();
  const leader = String(block.getFieldValue('ENTITY_ID') || '').trim();
  if (!domain || !leader) return '';

  const members = [];
  let child = block.getInputTargetBlock('MEMBERS');
  while (child) {
    if (child.type === `action_${domain}`) {
      const eidRaw = String(child.getFieldValue('ENTITY_ID') || '').trim();
      if (eidRaw === '__template__') {
        const tmpl = String(child.getFieldValue('TEMPLATE_ENTITY') || '').trim();
        if (tmpl) members.push(tmpl);
      } else if (eidRaw) {
        members.push(eidRaw);
      }
    }
    child = child.getNextBlock();
  }

  const uniqueMembers = [...new Set(members)];
  if (!uniqueMembers.length) return '';

  const dataCode = block.getInput('DATA')
    ? (generator.statementToCode(block, 'DATA') || '')
    : '';

  let yaml = `- action: ${domain}.join\n`;
  yaml += '  target:\n';
  yaml += `    entity_id: ${leader}\n`;
  yaml += '  data:\n';
  yaml += '    group_members:\n';
  for (const eid of uniqueMembers) {
    yaml += `      - ${eid}\n`;
  }
  if (dataCode.trim()) {
    yaml += generator.prefixLines(dataCode, '  ');
  }
  return yaml + '\n';
};

yamlGenerator.forBlock['action_ecobee_service'] = function (block, generator) {
  const service = String(block.getFieldValue('SERVICE') || '').trim();
  const requiredEntityServices = new Set(['create_vacation', 'delete_vacation', 'set_sensors_in_climate']);
  const requireEntity = requiredEntityServices.has(service);
  const useEntity = requireEntity || (block.getFieldValue('USE_ENTITY') === 'TRUE');
  const entityId = String(block.getFieldValue('ENTITY_ID') || '').trim();
  if (!service) return '';
  if (requireEntity && !entityId) return '';

  const i = yamlGenerator.INDENT;
  const ii = i + i;
  const lines = [
    `- action: ecobee.${service}`,
    `${i}data:`,
  ];
  if (useEntity && entityId) {
    lines.push(`${ii}entity_id: ${entityId}`);
  }

  const dataCode = block.getInput('DATA')
    ? generator.statementToCode(block, 'DATA')
    : '';
  if (dataCode.trim()) {
    lines.push(generator.prefixLines(dataCode, i));
  }

  lines.push('');
  return lines.join('\n');
};

// chain next blocks
yamlGenerator.scrub_ = function (block, code, thisOnly) {
  const nextBlock = block.nextConnection && block.nextConnection.targetBlock();
  if (nextBlock && !thisOnly) {
    return code + yamlGenerator.blockToCode(nextBlock);
  }
  return code;
};
