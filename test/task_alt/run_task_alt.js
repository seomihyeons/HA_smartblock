import * as Blockly from 'blockly';
import { yamlTextToInternalJson } from '../../src/import/yaml_import';
import { renderAutomationToWorkspace } from '../../src/import/yamlToBlocks';
import { yamlGenerator } from '../../src/generators/yaml';
import { compareSemantic } from './semantic_compare';
import { classifyRawBlocks } from './raw_classifier';
import { formatOneReport, statusFromResult } from './report_formatter';
import { detectTaskAltKeyword } from './baseline_keywords';

const RAW_TYPES = new Set([
  'ha_event_raw_lines',
  'ha_condition_raw_lines',
  'ha_action_raw_lines',
  'ha_triggers_raw',
  'ha_conditions_raw',
  'ha_actions_raw',
]);

export async function runTaskAltBatch(files, ws) {
  if (!ws) throw new Error('Workspace is required.');
  const list = Array.from(files || []);
  if (!list.length) return { results: [], summaryText: '파일이 없습니다.' };

  const snapshot = Blockly.serialization.workspaces.save(ws);
  const chunks = [];
  const results = [];

  try {
    for (const f of list) {
      try {
        const text = await f.text();
        const original = yamlTextToInternalJson(text);

        renderAutomationToWorkspace(ws, original, { clearBefore: true });
        const rawBlocks = ws.getAllBlocks(false).filter((b) => RAW_TYPES.has(b.type));

        const regeneratedYaml = yamlGenerator.workspaceToCode(ws);
        const regenerated = yamlTextToInternalJson(regeneratedYaml);
        const compareResult = compareSemantic(original, regenerated);
        const rawInfo = classifyRawBlocks(rawBlocks);
        const status = statusFromResult(compareResult, rawInfo.length);
        const lines = formatOneReport({ name: f.name, compareResult, rawInfo });

        results.push({
          name: f.name,
          status,
          lines,
          originalText: text,
          originalJson: original,
          regeneratedYaml,
          regeneratedJson: regenerated,
          compareResult,
          rawInfo,
        });
        chunks.push(lines);
      } catch (e) {
        const lines = `${f.name}: ERROR\n- ${String(e?.message || e)}`;
        results.push({
          name: f.name,
          status: 'ERROR',
          lines,
          originalText: '',
          originalJson: null,
          regeneratedYaml: '',
          regeneratedJson: null,
          compareResult: null,
          rawInfo: [],
        });
        chunks.push(lines);
      }
      chunks.push('');
    }
  } finally {
    ws.clear();
    Blockly.serialization.workspaces.load(snapshot, ws);
  }

  return {
    results,
    summaryText: chunks.join('\n').trimEnd(),
  };
}

function normalizeStatus(status) {
  if (status === 'PASS' || status === 'PASS_WITH_NORMALIZATION') return 'PASS';
  if (status === 'PASS_WITH_RAW') return 'PASS_WITH_RAW';
  return 'FAIL';
}

function statusRank(status) {
  const s = normalizeStatus(status);
  if (s === 'PASS') return 0;
  if (s === 'PASS_WITH_RAW') return 1;
  return 2;
}

function toBaselineFileEntry(result) {
  const counts = result?.compareResult?.counts?.regenerated || { triggers: 0, conditions: 0, actions: 0 };
  return {
    status: String(result?.status || 'ERROR'),
    normStatus: normalizeStatus(result?.status || 'ERROR'),
    counts: {
      triggers: Number(counts.triggers || 0),
      conditions: Number(counts.conditions || 0),
      actions: Number(counts.actions || 0),
    },
    rawCount: Array.isArray(result?.rawInfo) ? result.rawInfo.length : 0,
    rawTypes: Array.isArray(result?.rawInfo) ? result.rawInfo.map((x) => String(x.type || '')) : [],
  };
}

function buildStatusBuckets(filesMap) {
  const buckets = {};
  for (const [name, entry] of Object.entries(filesMap || {})) {
    const status = String(entry?.status || 'UNKNOWN');
    if (!buckets[status]) buckets[status] = [];
    buckets[status].push(name);
  }
  for (const k of Object.keys(buckets)) {
    buckets[k].sort((a, b) => a.localeCompare(b));
  }
  return buckets;
}

function buildStatusCounts(filesMap) {
  const counts = {};
  for (const entry of Object.values(filesMap || {})) {
    const status = String(entry?.status || 'UNKNOWN');
    counts[status] = Number(counts[status] || 0) + 1;
  }
  return counts;
}

function formatStatusCounts(counts) {
  const keys = Object.keys(counts || {}).sort((a, b) => a.localeCompare(b));
  if (!keys.length) return '(none)';
  return keys.map((k) => `${k}=${counts[k]}`).join(', ');
}

export function createEmptyBaselineStore(now = new Date().toISOString()) {
  return {
    version: 2,
    updatedAt: now,
    keywords: {},
  };
}

function remapBaselineKeywords(keywords) {
  const src = (keywords && typeof keywords === 'object') ? keywords : {};
  const out = {};

  for (const history of Object.values(src)) {
    if (!Array.isArray(history)) continue;

    for (const item of history) {
      if (!item || typeof item !== 'object') continue;
      const recordedAt = String(item.recordedAt || '');
      const files = (item.files && typeof item.files === 'object') ? item.files : {};

      const filesByKeyword = {};
      for (const [fileName, entry] of Object.entries(files)) {
        const keyword = detectTaskAltKeyword(fileName);
        if (!filesByKeyword[keyword]) filesByKeyword[keyword] = {};
        filesByKeyword[keyword][fileName] = entry;
      }

      for (const [keyword, groupedFiles] of Object.entries(filesByKeyword)) {
        if (!out[keyword]) out[keyword] = [];
        let target = out[keyword].find((x) => String(x.recordedAt || '') === recordedAt);
        if (!target) {
          target = { recordedAt, files: {} };
          out[keyword].push(target);
        }
        Object.assign(target.files, groupedFiles);
      }
    }
  }

  return out;
}

function ensureBaselineStore(store) {
  if (!store || typeof store !== 'object') return createEmptyBaselineStore();
  if (!store.keywords || typeof store.keywords !== 'object') store.keywords = {};
  store.keywords = remapBaselineKeywords(store.keywords);
  if (!store.version) store.version = 2;
  if (!store.updatedAt) store.updatedAt = new Date().toISOString();
  return store;
}

export function buildBaselineFromResults(results, recordedAt = new Date().toISOString()) {
  const keywords = {};
  for (const r of Array.from(results || [])) {
    if (!r?.name) continue;
    const keyword = detectTaskAltKeyword(r.name);
    if (!keywords[keyword]) keywords[keyword] = { files: {} };
    keywords[keyword].files[r.name] = toBaselineFileEntry(r);
  }
  return {
    recordedAt,
    keywords,
  };
}

export function mergeBaselineStore(store, snapshot, maxHistory = 20) {
  const next = ensureBaselineStore(JSON.parse(JSON.stringify(store || createEmptyBaselineStore())));
  const recordedAt = String(snapshot?.recordedAt || new Date().toISOString());

  for (const [keyword, data] of Object.entries(snapshot?.keywords || {})) {
    if (!next.keywords[keyword]) next.keywords[keyword] = [];
    next.keywords[keyword].push({
      recordedAt,
      files: data?.files || {},
    });
    if (next.keywords[keyword].length > maxHistory) {
      next.keywords[keyword] = next.keywords[keyword].slice(-maxHistory);
    }
  }

  next.updatedAt = new Date().toISOString();
  return next;
}

export function formatBaselineRecordSummary(snapshot) {
  const lines = ['BASELINE SAVED'];
  const keywords = Object.keys(snapshot?.keywords || {}).sort((a, b) => a.localeCompare(b));
  lines.push(`- recordedAt: ${snapshot?.recordedAt || ''}`);
  lines.push(`- keywords: ${keywords.length}`);

  for (const keyword of keywords) {
    const files = snapshot.keywords[keyword]?.files || {};
    const buckets = buildStatusBuckets(files);
    lines.push('');
    lines.push(`=== ${keyword} ===`);
    for (const [status, fileList] of Object.entries(buckets)) {
      lines.push(`- ${status} (${fileList.length})`);
      for (const name of fileList) lines.push(`  - ${name}`);
    }
  }

  return lines.join('\n');
}

export function compareResultsWithBaseline(results, baselineStore, comparedAt = new Date().toISOString()) {
  const store = ensureBaselineStore(JSON.parse(JSON.stringify(baselineStore || createEmptyBaselineStore())));
  const current = buildBaselineFromResults(results, comparedAt);
  const regressions = [];
  const keywordReports = [];
  const lines = [];

  const keywords = Object.keys(current.keywords || {}).sort((a, b) => a.localeCompare(b));
  for (const keyword of keywords) {
    const history = Array.isArray(store.keywords?.[keyword]) ? store.keywords[keyword] : [];
    const report = {
      keyword,
      skipped: false,
      comparedAt: current.recordedAt,
      baselineRecordedAt: '',
      baselineStatusCounts: {},
      currentStatusCounts: {},
      statusDiff: [],
      countDiff: [],
      rawDiff: [],
      newFiles: [],
      missingFiles: [],
      noDifferences: false,
    };
    lines.push(`=== ${keyword} ===`);
    if (!history.length) {
      report.skipped = true;
      lines.push('- SKIP (no baseline)');
      lines.push('');
      keywordReports.push(report);
      continue;
    }

    const latest = history[history.length - 1] || { recordedAt: '', files: {} };
    report.baselineRecordedAt = latest.recordedAt || '';
    lines.push(`- baseline recordedAt: ${latest.recordedAt || ''}`);
    lines.push(`- comparedAt: ${current.recordedAt}`);

    const baseFiles = latest.files || {};
    const curFiles = current.keywords[keyword]?.files || {};
    const baseStatusCounts = buildStatusCounts(baseFiles);
    const curStatusCounts = buildStatusCounts(curFiles);
    report.baselineStatusCounts = baseStatusCounts;
    report.currentStatusCounts = curStatusCounts;

    lines.push(`- baseline status: ${formatStatusCounts(baseStatusCounts)}`);
    lines.push(`- current status: ${formatStatusCounts(curStatusCounts)}`);

    const statusDiff = [];
    const countDiff = [];
    const rawDiff = [];
    const newFiles = [];
    const missingFiles = [];

    for (const [name, cur] of Object.entries(curFiles)) {
      const base = baseFiles[name];
      if (!base) {
        newFiles.push(name);
        continue;
      }

      if (String(base.status) !== String(cur.status)) {
        statusDiff.push(`${name}: ${base.status} -> ${cur.status}`);
      }

      if (
        Number(base.counts?.triggers || 0) !== Number(cur.counts?.triggers || 0) ||
        Number(base.counts?.conditions || 0) !== Number(cur.counts?.conditions || 0) ||
        Number(base.counts?.actions || 0) !== Number(cur.counts?.actions || 0)
      ) {
        countDiff.push(
          `${name}: trigger ${base.counts?.triggers || 0}->${cur.counts?.triggers || 0}, ` +
          `condition ${base.counts?.conditions || 0}->${cur.counts?.conditions || 0}, ` +
          `action ${base.counts?.actions || 0}->${cur.counts?.actions || 0}`
        );
      }

      if (Number(cur.rawCount || 0) !== Number(base.rawCount || 0)) {
        rawDiff.push(`${name}: raw ${base.rawCount || 0}->${cur.rawCount || 0}`);
      }

      const worsenedStatus = statusRank(cur.status) > statusRank(base.status || base.normStatus || 'FAIL');
      const rawIncreased = Number(cur.rawCount || 0) > Number(base.rawCount || 0);
      const countsChanged =
        Number(base.counts?.triggers || 0) !== Number(cur.counts?.triggers || 0) ||
        Number(base.counts?.conditions || 0) !== Number(cur.counts?.conditions || 0) ||
        Number(base.counts?.actions || 0) !== Number(cur.counts?.actions || 0);
      if (worsenedStatus || rawIncreased || countsChanged) {
        regressions.push({ keyword, name });
      }
    }

    for (const name of Object.keys(baseFiles)) {
      if (!curFiles[name]) missingFiles.push(name);
    }

    report.statusDiff = statusDiff;
    report.countDiff = countDiff;
    report.rawDiff = rawDiff;
    report.newFiles = [...newFiles].sort((a, b) => a.localeCompare(b));
    report.missingFiles = [...missingFiles].sort((a, b) => a.localeCompare(b));

    if (statusDiff.length) {
      lines.push('- status diff:');
      statusDiff.forEach((x) => lines.push(`  - ${x}`));
    }
    if (countDiff.length) {
      lines.push('- count diff:');
      countDiff.forEach((x) => lines.push(`  - ${x}`));
    }
    if (rawDiff.length) {
      lines.push('- raw diff:');
      rawDiff.forEach((x) => lines.push(`  - ${x}`));
    }
    if (newFiles.length) {
      lines.push('- new files (no baseline):');
      report.newFiles.forEach((x) => lines.push(`  - ${x}`));
    }
    if (missingFiles.length) {
      lines.push('- missing in current run:');
      report.missingFiles.forEach((x) => lines.push(`  - ${x}`));
    }
    if (!statusDiff.length && !countDiff.length && !rawDiff.length && !newFiles.length && !missingFiles.length) {
      report.noDifferences = true;
      lines.push('- no differences');
    }

    lines.push('');
    keywordReports.push(report);
  }

  const head = regressions.length
    ? [`REGRESSION CHECK: FAIL`, `- regressions: ${regressions.length}`, '']
    : ['REGRESSION CHECK: PASS', '- 회귀 없음', ''];

  return {
    currentSnapshot: current,
    regressions,
    model: {
      ok: regressions.length === 0,
      comparedAt: current.recordedAt,
      keywordReports,
      regressionCount: regressions.length,
    },
    summaryText: [...head, ...lines].join('\n').trimEnd(),
  };
}
