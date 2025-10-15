// src/generators/yaml.js

import * as Blockly from 'blockly';

export const yamlGenerator = new Blockly.CodeGenerator('YAML');

const Order = {
  ATOMIC: 0,
};

// Home Assistant YAML style: 2-space indent
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

/* ===== Home Assistant custom blocks ===== */
// EA container block (Event-Action)
yamlGenerator.forBlock['event_action'] = function (block, generator) {
  const alias = block.getFieldValue('ALIAS') || '';
  const id = block.getFieldValue('ID') || '';
  const eventCode = generator.statementToCode(block, 'EVENT');
  const actionCode = generator.statementToCode(block, 'ACTION');

  let code = `- alias: '${alias}'\n`;
  if (id && id != "(Optional)") { code += `  id: '${id}'\n`; }

  code += `\n  triggers:\n`; code += generator.prefixLines(eventCode, `  `);
  code += `\n  actions:\n`; code += generator.prefixLines(actionCode, `  `);

  return code;
};

// ECA container block (Event-Condition-Action)
yamlGenerator.forBlock['event_condition_action'] = function (block, generator) {
  const alias = block.getFieldValue('ALIAS') || '';
  const id = block.getFieldValue('ID') || '';
  const eventCode = generator.statementToCode(block, 'EVENT');
  const conditionCode = generator.statementToCode(block, 'CONDITION');
  const actionCode = generator.statementToCode(block, 'ACTION');

  let code = `- alias: '${alias}'\n`;
  if (id && id != "(Optional)") { code += `  id: '${id}'\n`; }

  code += `\n  triggers:\n`; code += generator.prefixLines(eventCode, `  `);
  if (conditionCode) { code += `\n  conditions:\n`; code += generator.prefixLines(conditionCode, `  `); }
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

// Event: generic light state trigger
yamlGenerator.forBlock['ha_event_light_state'] = function (block) {
  const entityId = block.getFieldValue('ENTITY') || '';
  const from = block.getFieldValue('FROM') || '';
  const to   = block.getFieldValue('TO')   || '';
  const forValue = yamlGenerator.valueToCode(block, 'FOR', 0) || '';

  let code = `- trigger: state\n`;
  if (entityId) code += `  entity_id: ${entityId}\n`;
  if (from)     code += `  from: '${from}'\n`;
  if (to)       code += `  to: '${to}'\n`;
  if (forValue.trim()) { code += `  for: ${forValue}\n`; }

  return code;
};

// Event: binary state trigger
yamlGenerator.forBlock['ha_event_binary_state'] = function (block) {
  const entityId = block.getFieldValue('ENTITY') || '';
  const from = block.getFieldValue('FROM') || '';
  const to = block.getFieldValue('TO') || '';
  const forValue = yamlGenerator.valueToCode(block, 'FOR', 0) || '';

  let code = `- trigger: state\n`;
  code += `  entity_id: ${entityId}\n`;
  if (from) code += `  from: '${from}'\n`;
  if (to)   code += `  to: '${to}'\n`;
  if (forValue.trim()) { code += `  for: ${forValue}\n`; }

  return code;
};

// Event: switch state trigger
yamlGenerator.forBlock['ha_event_switch_state'] = function (block) {
  const entityId = block.getFieldValue('ENTITY') || '';
  const from = block.getFieldValue('FROM') || '';
  const to = block.getFieldValue('TO') || '';
  const forValue = yamlGenerator.valueToCode(block, 'FOR', 0) || '';

  let code = `- trigger: state\n`;
  code += `  entity_id: ${entityId}\n`;
  if (from) code += `  from: '${from}'\n`;
  if (to)   code += `  to: '${to}'\n`;
  if (forValue.trim()) { code += `  for: ${forValue}\n`; }

  return code;
};

// Event: lock state trigger
yamlGenerator.forBlock['ha_event_lock_state'] = function (block) {
  const entityId = block.getFieldValue('ENTITY') || '';
  const from = block.getFieldValue('FROM') || '';
  const to = block.getFieldValue('TO') || '';

  const forValue = yamlGenerator.valueToCode(block, 'FOR', 0) || '';
  let code = `- trigger: state\n`;
  code += `  entity_id: ${entityId}\n`;
  if (from) code += `  from: '${from}'\n`;
  if (to) code += `  to: '${to}'\n`;
  if (forValue.trim()) { code += `  for: ${forValue}\n`; }

  return code;
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
yamlGenerator.forBlock['ha_event_time_state'] = function (block, generator) {
  const hour12 = Number(block.getFieldValue('HOUR') || 0);
  const minute = Number(block.getFieldValue('MIN') || 0);
  const period = block.getFieldValue('PERIOD') || 'AM';

  let h = hour12 % 12;
  if (period === 'PM') h += 12;
  const HH = String(h).padStart(2, '0');
  const MM = String(minute).padStart(2, '0');

  let code = `- trigger: time\n`;
  code += `  at: '${HH}:${MM}:00'\n`;

  const extra = generator.valueToCode(block, 'EXTRA', 0 /* Order.ATOMIC */) || '';
  if (extra) {
    code += generator.prefixLines(extra, '  ');
  }
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

/* ===== Conditions ===== */
// Condition: template (AND/OR/NOT group)
yamlGenerator.forBlock['condition_logic'] = function (block) {
  const logic = block.getFieldValue('LOGIC').toLowerCase();
  const innerConds = yamlGenerator.statementToCode(block, 'SUBCONDITIONS') || '';
  return `- ${logic}:\n${innerConds}`;
};

// Condition: entity state
const CONDITION_STATE_DOMAINS = [
  'light',
  'switch',
  'lock',
  'media_player',
  'binary_sensor',
  'climate',
];

for (const domain of CONDITION_STATE_DOMAINS) {
  yamlGenerator.forBlock[`condition_state_${domain}`] = function (block) {
    const entityId = block.getFieldValue('ENTITY_ID') || '';
    const state    = block.getFieldValue('STATE') || '';
    if (!entityId || !state) return '';

    const i = yamlGenerator.INDENT;
    return [
      `- condition: state`,
      `${i}entity_id: ${entityId}`,
      `${i}state: '${String(state)}'`,
      ''
    ].join('\n');
  };
}

// Condition: numeric_state (entity)
yamlGenerator.forBlock['condition_numeric_state_entity'] = function (block) {
  const entityId = block.getFieldValue('ENTITY_ID') || '';
  const above = parseFloat(block.getFieldValue('ABOVE'));
  const below = parseFloat(block.getFieldValue('BELOW'));

  if (!entityId) return '';

  const i = yamlGenerator.INDENT;
  const lines = [
    `- condition: numeric_state`,
    `${i}entity_id: ${entityId}`
  ];

  if (!isNaN(above) && above > 0) lines.push(`${i}above: ${above}`);
  if (!isNaN(below) && below > 0) lines.push(`${i}below: ${below}`);

  lines.push('');
  return lines.join('\n');
};

// Condition: numeric_state (attribute)
yamlGenerator.forBlock['condition_numeric_state_attribute'] = function (block) {
  const entityId  = block.getFieldValue('ENTITY_ID') || '';
  const attribute = block.getFieldValue('ATTRIBUTE') || '';
  const above = parseFloat(block.getFieldValue('ABOVE'));
  const below = parseFloat(block.getFieldValue('BELOW'));

  if (!entityId || !attribute) return '';

  const i = yamlGenerator.INDENT;
  const lines = [
    `- condition: numeric_state`,
    `${i}entity_id: ${entityId}`,
    `${i}attribute: ${attribute}`
  ];

  if (!isNaN(above) && above > 0) lines.push(`${i}above: ${above}`);
  if (!isNaN(below) && below > 0) lines.push(`${i}below: ${below}`);

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

  let code = `- delay: "${hhmmss}"\n`;
  return code;
};

// Action: entity
const ACTION_DOMAINS = ['light', 'switch', 'lock', 'media_player', 'climate'];
for (const domain of ACTION_DOMAINS) {
  yamlGenerator.forBlock[`action_${domain}`] = function (block) {
    const entityId = block.getFieldValue('ENTITY_ID') || '';
    const action = block.getFieldValue('ACTION') || '';
    if (!entityId || !action) return '';

    const i = yamlGenerator.INDENT;
    const ii = i + i;

    const lines = [];
    lines.push(`- action: ${domain}.${action}`);
    lines.push(`${i}target:`);
    lines.push(`${ii}entity_id: ${entityId}`);
    lines.push('');
    return lines.join('\n');
  };
}

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
  lines.push(`${ii}sequence:`);              // sequence는 conditions와 같은 깊이(i)
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
  //const svc = (block.getFieldValue('TARGET') || 'notify.notify').trim();
  const uiTarget = (block.getFieldValue('TARGET') || 'notify').trim(); // e.g., 'mobile_app_iphone', 'telegram', 'notify'
  const svc = uiTarget.startsWith('notify.') ? uiTarget : `notify.${uiTarget}`;
  const msg = (block.getFieldValue('MESSAGE') || '').trim();
  if (!msg) return `- # notify skipped: empty message\n`;

  
  const titleCode = generator.valueToCode(block, 'TITLE', 0) || '';
  let code = `- action: ${svc}\n  data:\n`;
  if ( msg != `message` ) {
    code += `    message: ${JSON.stringify(msg)}\n`;
  };
  
  if (titleCode.trim()) {
    code += `    title: ${titleCode}\n`;
  }
  return code;
};

// Action: notify_title
yamlGenerator.forBlock['action_notify_title'] = function (block) {
  const t = (block.getFieldValue('TITLE') || '').trim();
  return [JSON.stringify(t), Order.ATOMIC];
};

// chain next blocks
yamlGenerator.scrub_ = function (block, code, thisOnly) {
  const nextBlock = block.nextConnection && block.nextConnection.targetBlock();
  if (nextBlock && !thisOnly) {
    return code + yamlGenerator.blockToCode(nextBlock);
  }
  return code;
};
