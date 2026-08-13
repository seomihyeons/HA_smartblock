import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { execSync } from 'child_process';
import * as Blockly from 'blockly';

import '../../src/blocks/extensions.js';
import { ruleBlocks } from '../../src/blocks/rule_blocks.js';
import { rawLinesBlocks } from '../../src/blocks/raw_lines.js';
import { haEventStateBlocks } from '../../src/blocks/event/event_HA_state.js';
import { eventEntityBlocks } from '../../src/blocks/event/event_entity.js';
import { eventGroupBlocks } from '../../src/blocks/event/event_group.js';
import { eventNumericSensorBlocks } from '../../src/blocks/event/event_sensor_state.js';
import { eventTimeStateBlocks } from '../../src/blocks/event/event_time_state.js';
import { eventTemplateBlocks } from '../../src/blocks/event/event_template.js';
import { eventForBlocks } from '../../src/blocks/event/event_for.js';
import { haEventSunBlocks } from '../../src/blocks/event/event_sun.js';
import { eventSunStateBlocks } from '../../src/blocks/event/event_sun_state.js';
import { eventEventBlocks } from '../../src/blocks/event/event_event.js';
import { eventMqttBlocks } from '../../src/blocks/event/event_mqtt.js';
import { conditionLogicBlocks } from '../../src/blocks/condition/condition_logic.js';
import { conditionStateBlocks } from '../../src/blocks/condition/condition_entity_state.js';
import { conditionSunBlocks } from '../../src/blocks/condition/condition_sun.js';
import { conditionTimeBlocks } from '../../src/blocks/condition/condition_time.js';
import { conditionTemplateBlocks } from '../../src/blocks/condition/condition_template.js';
import { conditionNumericStateEntityBlocks } from '../../src/blocks/condition/condition_numeric_state_entity.js';
import { conditionNumericStateAttributeBlocks } from '../../src/blocks/condition/condition_numeric_state_attribute.js';
import { actionEntityBlocks } from '../../src/blocks/action/action_entity.js';
import { actionEcobeeBlocks } from '../../src/blocks/action/action_ecobee.js';
import { actionDelayBlocks } from '../../src/blocks/action/action_delay.js';
import { actionIfBlocks } from '../../src/blocks/action/action_if.js';
import { actionNotifyBlocks } from '../../src/blocks/action/action_notify.js';
import { actionGroupBlocks } from '../../src/blocks/action/action.group.js';
import { actionJoinBlocks } from '../../src/blocks/action/action_join.js';
import { actionScriptBlocks } from '../../src/blocks/action/action_script.js';
import { actionNotifyTagBlocks } from '../../src/blocks/action/action_notify_tag.js';
import { actionDataBlocks } from '../../src/blocks/action/action_data.js';
import { actionMqttBlocks } from '../../src/blocks/action/action_mqtt.js';

import { yamlTextToInternalJson } from '../../src/import/yaml_import.js';
import { renderAutomationToWorkspace } from '../../src/import/yamlToBlocks.js';
import { yamlGenerator } from '../../src/generators/yaml.js';
import { compareSemantic } from '../../test/task_alt/semantic_compare.js';
import { classifyRawBlocks } from '../../test/task_alt/raw_classifier.js';
import { statusFromResult } from '../../test/task_alt/report_formatter.js';
import { detectTaskAltKeyword } from '../../test/task_alt/baseline_keywords.js';

const RAW_TYPES = new Set([
  'ha_event_raw_lines',
  'ha_condition_raw_lines',
  'ha_action_raw_lines',
  'ha_triggers_raw',
  'ha_conditions_raw',
  'ha_actions_raw',
]);

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    out: path.join('revision_evidence', 'evaluation'),
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--root') args.root = argv[++i] || args.root;
    else if (a === '--out') args.out = argv[++i] || args.out;
  }
  return args;
}

function patchBlocklyForHeadless() {
  if (Blockly.Block?.prototype && typeof Blockly.Block.prototype.initSvg !== 'function') {
    Blockly.Block.prototype.initSvg = function initSvgNoop() {};
  }
  if (Blockly.Block?.prototype && typeof Blockly.Block.prototype.render !== 'function') {
    Blockly.Block.prototype.render = function renderNoop() {};
  }
  if (typeof globalThis.HTMLElement === 'undefined') {
    globalThis.HTMLElement = class HTMLElement {};
  }
}

function createHeadlessWorkspace() {
  const ws = new Blockly.Workspace();
  const parent = new globalThis.HTMLElement();
  parent.offsetWidth = 0;
  parent.offsetHeight = 0;
  const svg = {
    parentElement: parent,
    setAttribute() {},
  };
  ws.getParentSvg = () => svg;
  ws.getCachedParentSvgSize = () => ({ width: 0, height: 0 });
  ws.setCachedParentSvgSize = () => {};
  ws.resize = () => {};
  return ws;
}

function defineRawSectionBlocks() {
  const defs = Blockly.common.createBlockDefinitionsFromJsonArray([
    {
      type: 'ha_triggers_raw',
      message0: '%1',
      args0: [{ type: 'field_multiline_input', name: 'YAML', text: '' }],
      previousStatement: 'HA_EVENT',
      nextStatement: 'HA_EVENT',
      colour: 180,
      tooltip: 'Raw trigger YAML fallback.',
      helpUrl: '',
    },
    {
      type: 'ha_conditions_raw',
      message0: '%1',
      args0: [{ type: 'field_multiline_input', name: 'YAML', text: '' }],
      previousStatement: 'HA_CONDITION',
      nextStatement: 'HA_CONDITION',
      colour: 'AECA3E',
      tooltip: 'Raw condition YAML fallback.',
      helpUrl: '',
    },
    {
      type: 'ha_actions_raw',
      message0: '%1',
      args0: [{ type: 'field_multiline_input', name: 'YAML', text: '' }],
      previousStatement: 'HA_ACTION',
      nextStatement: 'HA_ACTION',
      colour: 'E3CC57',
      tooltip: 'Raw action YAML fallback.',
      helpUrl: '',
    },
  ]);
  Blockly.common.defineBlocks(defs);
}

function registerBlocks() {
  [
    rawLinesBlocks,
    ruleBlocks,
    haEventStateBlocks,
    eventEntityBlocks,
    eventGroupBlocks,
    eventNumericSensorBlocks,
    eventTimeStateBlocks,
    eventTemplateBlocks,
    eventForBlocks,
    haEventSunBlocks,
    eventSunStateBlocks,
    eventEventBlocks,
    eventMqttBlocks,
    conditionLogicBlocks,
    conditionStateBlocks,
    conditionSunBlocks,
    conditionTimeBlocks,
    conditionTemplateBlocks,
    conditionNumericStateEntityBlocks,
    conditionNumericStateAttributeBlocks,
    actionEntityBlocks,
    actionEcobeeBlocks,
    actionDataBlocks,
    actionDelayBlocks,
    actionIfBlocks,
    actionNotifyBlocks,
    actionGroupBlocks,
    actionJoinBlocks,
    actionScriptBlocks,
    actionNotifyTagBlocks,
    actionMqttBlocks,
  ].forEach((defs) => Blockly.common.defineBlocks(defs));
  defineRawSectionBlocks();
}

function normalizePathForReport(root, file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function walkDataset(root) {
  const testRoot = path.join(root, 'test');
  const out = [];
  const excluded = [];

  for (const dirent of fs.readdirSync(testRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    if (!/^test_/.test(dirent.name)) continue;

    const dir = path.join(testRoot, dirent.name);
    const relDir = normalizePathForReport(root, dir);
    const isExcluded = relDir === 'test/test_raw_demo' || relDir === 'test/test_xhome_demo';
    const stack = [dir];

    while (stack.length) {
      const cur = stack.pop();
      for (const item of fs.readdirSync(cur, { withFileTypes: true })) {
        const full = path.join(cur, item.name);
        if (item.isDirectory()) {
          stack.push(full);
          continue;
        }
        if (!/\.(ya?ml)$/i.test(item.name)) continue;
        if (isExcluded) excluded.push(normalizePathForReport(root, full));
        else out.push(full);
      }
    }
  }

  out.sort((a, b) => normalizePathForReport(root, a).localeCompare(normalizePathForReport(root, b)));
  excluded.sort((a, b) => a.localeCompare(b));
  return { files: out, excluded };
}

function safeGitValue(root, command) {
  try {
    return execSync(command, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'manual_required';
  }
}

function roundMs(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function evaluateOne(file, root, ws) {
  const rel = normalizePathForReport(root, file);
  const fileName = path.basename(file);
  const keyword = detectTaskAltKeyword(fileName);
  const started = performance.now();
  let importMs = 0;
  let exportMs = 0;
  let originalText = '';
  let original = null;
  let regeneratedYaml = '';
  let regenerated = null;
  let compareResult = null;
  let rawInfo = [];
  let status = 'ERROR';
  let failureCategory = '';
  let errorMessage = '';

  try {
    ws.clear();
    originalText = fs.readFileSync(file, 'utf8');

    const importStart = performance.now();
    original = yamlTextToInternalJson(originalText);
    renderAutomationToWorkspace(ws, original, { clearBefore: true });
    importMs = performance.now() - importStart;

    const rawBlocks = ws.getAllBlocks(false).filter((b) => RAW_TYPES.has(b.type));
    rawInfo = classifyRawBlocks(rawBlocks);

    const exportStart = performance.now();
    regeneratedYaml = yamlGenerator.workspaceToCode(ws);
    exportMs = performance.now() - exportStart;

    regenerated = yamlTextToInternalJson(regeneratedYaml);
    compareResult = compareSemantic(original, regenerated);
    status = statusFromResult(compareResult, rawInfo.length);
  } catch (e) {
    errorMessage = String(e?.stack || e?.message || e);
    if (!original) failureCategory = 'parse_or_import_error';
    else if (!regeneratedYaml) failureCategory = 'export_error';
    else failureCategory = 'compare_or_regenerated_parse_error';
  } finally {
    ws.clear();
  }

  const totalMs = performance.now() - started;
  const counts = compareResult?.counts?.regenerated || { triggers: 0, conditions: 0, actions: 0 };
  return {
    keyword,
    path: rel,
    file: fileName,
    status,
    norm_status: status === 'PASS' || status === 'PASS_WITH_NORMALIZATION' ? 'PASS' : status === 'PASS_WITH_RAW' ? 'PASS_WITH_RAW' : 'FAIL',
    semantic_equal: Boolean(compareResult?.semanticEqual),
    strict_round_trip: Boolean(compareResult?.strictEqual),
    normalization_only_difference: status === 'PASS_WITH_NORMALIZATION',
    full_editable_blocks: status !== 'ERROR' && rawInfo.length === 0,
    export_success: status !== 'ERROR' || Boolean(regeneratedYaml),
    triggers: Number(counts.triggers || 0),
    conditions: Number(counts.conditions || 0),
    actions: Number(counts.actions || 0),
    raw_count: rawInfo.length,
    raw_types: rawInfo.map((x) => x.type).filter(Boolean),
    failure_category: failureCategory,
    error_message: errorMessage,
    import_time_ms: roundMs(importMs),
    export_time_ms: roundMs(exportMs),
    total_time_ms: roundMs(totalMs),
  };
}

function countBy(rows, fn) {
  const out = {};
  rows.forEach((row) => {
    const key = fn(row);
    out[key] = Number(out[key] || 0) + 1;
  });
  return out;
}

function sum(rows, key) {
  return roundMs(rows.reduce((acc, row) => acc + Number(row[key] || 0), 0));
}

function avg(rows, key) {
  if (!rows.length) return 0;
  return roundMs(sum(rows, key) / rows.length);
}

function buildSummary(root, dataset, rows, startedAt, finishedAt) {
  const statusCounts = countBy(rows, (r) => r.status);
  const byKeyword = {};
  for (const row of rows) {
    if (!byKeyword[row.keyword]) byKeyword[row.keyword] = { total: 0, statuses: {} };
    byKeyword[row.keyword].total += 1;
    byKeyword[row.keyword].statuses[row.status] = Number(byKeyword[row.keyword].statuses[row.status] || 0) + 1;
  }
  const rawTypes = {};
  for (const row of rows) {
    row.raw_types.forEach((t) => {
      rawTypes[t] = Number(rawTypes[t] || 0) + 1;
    });
  }
  const failures = countBy(rows.filter((r) => r.status === 'ERROR' || r.status === 'FAIL'), (r) => r.failure_category || r.status);

  return {
    generated_at_utc: finishedAt,
    mode: 'current-code-headless',
    source: {
      evaluator: 'revision_evidence/scripts/headless_task_alt_eval.js',
      bundler_config: 'revision_evidence/scripts/webpack.headless.config.cjs',
      code_basis: 'root src/ and test/ current working tree; ha_smartblock/ remains the Home Assistant add-on distribution variant',
      git_branch: safeGitValue(root, 'git rev-parse --abbrev-ref HEAD'),
      git_commit: safeGitValue(root, 'git rev-parse HEAD'),
      working_tree_status_short: safeGitValue(root, 'git status --short'),
      started_at_utc: startedAt,
      finished_at_utc: finishedAt,
    },
    dataset: {
      filesystem_test_yaml_total_including_demo: rows.length + dataset.excluded.length,
      excluded_demo_files: dataset.excluded,
      evaluation_dataset_rule: 'test/test_*/*.yaml and *.yml excluding test/test_raw_demo/** and test/test_xhome_demo/**',
      evaluation_dataset_count: rows.length,
    },
    conversion_results: {
      total_automations: rows.length,
      fully_imported_into_editable_blocks_current_headless: rows.filter((r) => r.full_editable_blocks).length,
      partially_imported_with_raw_fallback_blocks: rows.filter((r) => r.raw_count > 0 || r.status === 'PASS_WITH_RAW').length,
      failed_to_import_or_parse: rows.filter((r) => r.status === 'ERROR' && r.failure_category === 'parse_or_import_error').length,
      export_success_count: rows.filter((r) => r.export_success).length,
      exact_round_trip_matches: rows.filter((r) => r.status === 'PASS').length,
      normalization_only_differences: rows.filter((r) => r.status === 'PASS_WITH_NORMALIZATION').length,
      semantic_mismatches: rows.filter((r) => r.status === 'FAIL').length,
      error_count: rows.filter((r) => r.status === 'ERROR').length,
      raw_block_count: rows.reduce((acc, row) => acc + row.raw_count, 0),
      unsupported_construct_types_from_raw_blocks: rawTypes,
      status_counts: statusCounts,
    },
    processing_time: {
      import_time_ms: sum(rows, 'import_time_ms'),
      export_time_ms: sum(rows, 'export_time_ms'),
      total_time_ms: sum(rows, 'total_time_ms'),
      average_import_time_ms: avg(rows, 'import_time_ms'),
      average_export_time_ms: avg(rows, 'export_time_ms'),
      average_total_time_ms: avg(rows, 'total_time_ms'),
      note: 'Import time is yamlTextToInternalJson plus renderAutomationToWorkspace. Export time is yamlGenerator.workspaceToCode. Total time includes file read, import, raw classification, export, regenerated parse, and semantic comparison.',
    },
    failure_taxonomy: {
      parse_or_import_error: rows.filter((r) => r.failure_category === 'parse_or_import_error').length,
      export_error: rows.filter((r) => r.failure_category === 'export_error').length,
      compare_or_regenerated_parse_error: rows.filter((r) => r.failure_category === 'compare_or_regenerated_parse_error').length,
      semantic_mismatch: rows.filter((r) => r.status === 'FAIL').length,
      raw_fallback_used: rows.filter((r) => r.raw_count > 0 || r.status === 'PASS_WITH_RAW').length,
      failure_category_counts: failures,
    },
    by_keyword: byKeyword,
    limitations: [
      'This is a headless Node/webpack evaluation of the current working tree, not an independently containerized Home Assistant add-on run.',
      'Timing values are wall-clock measurements from this local machine and should be reported with the hardware/software context if used in the manuscript.',
      'The evaluator reuses the repository lightweight YAML parser and semantic comparator; it is not a Home Assistant runtime validation.',
    ],
  };
}

function csvEscape(value) {
  const s = Array.isArray(value) ? value.join(';') : String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(outFile, rows) {
  const cols = [
    'keyword',
    'path',
    'file',
    'status',
    'norm_status',
    'semantic_equal',
    'strict_round_trip',
    'normalization_only_difference',
    'full_editable_blocks',
    'export_success',
    'triggers',
    'conditions',
    'actions',
    'raw_count',
    'raw_types',
    'failure_category',
    'import_time_ms',
    'export_time_ms',
    'total_time_ms',
    'error_message',
  ];
  const lines = [cols.join(',')];
  for (const row of rows) {
    lines.push(cols.map((c) => csvEscape(row[c])).join(','));
  }
  fs.writeFileSync(outFile, `${lines.join('\n')}\n`, 'utf8');
}

function markdownTable(headers, rows) {
  const out = [];
  out.push(`| ${headers.join(' | ')} |`);
  out.push(`| ${headers.map(() => '---').join(' | ')} |`);
  rows.forEach((row) => out.push(`| ${row.map((x) => String(x)).join(' | ')} |`));
  return out.join('\n');
}

function writePaperTables(outFile, summary) {
  const cr = summary.conversion_results;
  const pt = summary.processing_time;
  const ft = summary.failure_taxonomy;
  const statusRows = Object.entries(cr.status_counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => [k, v]);
  const domainRows = Object.entries(summary.by_keyword)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([keyword, data]) => [
      keyword,
      data.total,
      Object.entries(data.statuses).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(', '),
    ]);

  const sections = [];
  sections.push('# Paper-Ready Second-Pass Evaluation Tables');
  sections.push('');
  sections.push(`Generated: \`${summary.generated_at_utc}\``);
  sections.push(`Mode: \`${summary.mode}\``);
  sections.push('');
  sections.push('## Conversion Success Table');
  sections.push(markdownTable(
    ['Metric', 'Value', 'Evidence source'],
    [
      ['Total automations evaluated', cr.total_automations, 'Current-code headless run'],
      ['Fully imported into editable blocks', cr.fully_imported_into_editable_blocks_current_headless, 'status != ERROR and raw_count=0'],
      ['Partially imported with Raw/Fallback blocks', cr.partially_imported_with_raw_fallback_blocks, 'raw_count>0 or PASS_WITH_RAW'],
      ['Failed to import/parse', cr.failed_to_import_or_parse, 'parse_or_import_error'],
      ['Export success count', cr.export_success_count, 'Generated YAML available'],
    ],
  ));
  sections.push('');
  sections.push('## Raw/Fallback Block Usage Table');
  sections.push(markdownTable(
    ['Raw/Fallback metric', 'Value', 'Notes'],
    [
      ['Raw block count', cr.raw_block_count, 'Sum of raw_count in current headless run'],
      ['Automations using Raw/Fallback', cr.partially_imported_with_raw_fallback_blocks, 'Rows with raw_count>0 or PASS_WITH_RAW'],
      ['Unsupported construct types observed through Raw blocks', Object.keys(cr.unsupported_construct_types_from_raw_blocks).length ? JSON.stringify(cr.unsupported_construct_types_from_raw_blocks) : 'none recorded', 'Current headless run'],
    ],
  ));
  sections.push('');
  sections.push('## Round-Trip Preservation Table');
  sections.push(markdownTable(
    ['Round-trip class', 'Count', 'Definition'],
    [
      ['Exact', cr.exact_round_trip_matches, 'PASS; strict stable JSON equality and semantic equality'],
      ['Normalization-only', cr.normalization_only_differences, 'PASS_WITH_NORMALIZATION; semantic equality after normalization'],
      ['Semantic mismatch', cr.semantic_mismatches, 'FAIL; normalized semantics differ'],
      ['Error', cr.error_count, 'ERROR; exception during parse/render/export/compare path'],
    ],
  ));
  sections.push('');
  sections.push('## Failure Taxonomy Table');
  sections.push(markdownTable(
    ['Failure category', 'Count', 'Status/basis'],
    [
      ['Parse/import error', ft.parse_or_import_error, 'Exception before regenerated YAML'],
      ['Export error', ft.export_error, 'Exception during YAML generation'],
      ['Regenerated parse/compare error', ft.compare_or_regenerated_parse_error, 'Exception after regenerated YAML'],
      ['Semantic mismatch', ft.semantic_mismatch, 'FAIL'],
      ['Raw fallback used', ft.raw_fallback_used, 'PASS_WITH_RAW or raw_count>0'],
    ],
  ));
  sections.push('');
  sections.push('## Processing-Time Table');
  sections.push(markdownTable(
    ['Processing-time metric', 'Value (ms)', 'Definition'],
    [
      ['Import time', pt.import_time_ms, 'Sum of YAML parse plus renderAutomationToWorkspace'],
      ['Export time', pt.export_time_ms, 'Sum of yamlGenerator.workspaceToCode'],
      ['Total time', pt.total_time_ms, 'Sum of full per-file evaluation path'],
      ['Average import time', pt.average_import_time_ms, 'Import time divided by evaluated automations'],
      ['Average export time', pt.average_export_time_ms, 'Export time divided by evaluated automations'],
      ['Average total time', pt.average_total_time_ms, 'Total time divided by evaluated automations'],
    ],
  ));
  sections.push('');
  sections.push('## Status Count Detail');
  sections.push(markdownTable(['Status', 'Count'], statusRows));
  sections.push('');
  sections.push('## Per-Domain Status Detail');
  sections.push(markdownTable(['Domain keyword', 'Total', 'Statuses'], domainRows));
  sections.push('');
  fs.writeFileSync(outFile, `${sections.join('\n')}\n`, 'utf8');
}

function main() {
  const args = parseArgs(process.argv);
  const root = path.resolve(args.root);
  const outDir = path.resolve(root, args.out);
  fs.mkdirSync(outDir, { recursive: true });
  patchBlocklyForHeadless();
  registerBlocks();

  const startedAt = new Date().toISOString();
  const dataset = walkDataset(root);
  const ws = createHeadlessWorkspace();
  const rows = dataset.files.map((file) => evaluateOne(file, root, ws));
  ws.dispose();
  const finishedAt = new Date().toISOString();
  const summary = buildSummary(root, dataset, rows, startedAt, finishedAt);

  fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  writeCsv(path.join(outDir, 'per_automation.csv'), rows);
  writePaperTables(path.join(outDir, 'paper_tables.md'), summary);
  console.log(JSON.stringify({
    mode: summary.mode,
    evaluated: summary.dataset.evaluation_dataset_count,
    status_counts: summary.conversion_results.status_counts,
    timing_ms: summary.processing_time,
    output_dir: normalizePathForReport(root, outDir),
  }, null, 2));
}

main();
