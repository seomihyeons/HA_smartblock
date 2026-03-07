import {
  runTaskAltBatch,
  buildBaselineFromResults,
  formatBaselineRecordSummary,
  compareResultsWithBaseline,
} from './run_task_alt';
import { renderAutomationToWorkspace } from '../../src/import/yamlToBlocks';
import { readBaselineFile, appendBaselineSnapshot, clearBaselineFile } from './baseline_io';

function $(id) { return document.getElementById(id); }
const TASK_ALT_LAST_RESULTS_KEY = 'taskAlt:lastResults:v1';

function toBaselineCacheResult(r) {
  return {
    name: String(r?.name || ''),
    status: String(r?.status || 'ERROR'),
    compareResult: r?.compareResult || null,
    rawInfo: Array.isArray(r?.rawInfo) ? r.rawInfo : [],
  };
}

function saveLastResultsCache(results) {
  try {
    const list = Array.isArray(results) ? results.map(toBaselineCacheResult).filter((x) => x.name) : [];
    window.localStorage?.setItem(TASK_ALT_LAST_RESULTS_KEY, JSON.stringify(list));
  } catch {
    // no-op
  }
}

function loadLastResultsCache() {
  try {
    const raw = window.localStorage?.getItem(TASK_ALT_LAST_RESULTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(toBaselineCacheResult)
      .filter((x) => x.name);
  } catch {
    return [];
  }
}

export function initTaskAltUI({ ws }) {
  const btn = $('btnTaskAlt');
  const modal = $('taskAltModal');
  const backdrop = $('taskAltModalBackdrop');
  const btnClose = $('taskAltModalClose');
  const btnImport = $('taskAltImport');
  const btnRun = $('taskAltRun');
  const btnCopy = $('taskAltCopy');
  const out = $('taskAltOutput');
  const actionsWrap = btnRun?.parentNode || null;
  let importSlot = null;

  if (!btn || !modal || !btnImport || !btnRun || !btnCopy || !out || !ws) return;

  const btnBaseline = document.createElement('button');
  btnBaseline.type = 'button';
  btnBaseline.id = 'taskAltBaseline';
  btnBaseline.className = btnRun.className;
  btnBaseline.textContent = 'Record Baseline';

  const btnRegression = document.createElement('button');
  btnRegression.type = 'button';
  btnRegression.id = 'taskAltRegression';
  btnRegression.className = btnRun.className;
  btnRegression.textContent = 'Run Regression';

  const btnBaselineClear = document.createElement('button');
  btnBaselineClear.type = 'button';
  btnBaselineClear.id = 'taskAltBaselineClear';
  btnBaselineClear.className = 'taskalt-filter-btn';
  btnBaselineClear.textContent = 'Clear Baseline';

  const btnImportFolder = document.createElement('button');
  btnImportFolder.type = 'button';
  btnImportFolder.id = 'taskAltImportFolder';
  btnImportFolder.className = btnRun.className;
  btnImportFolder.textContent = 'Folder';

  const btnImportFile = document.createElement('button');
  btnImportFile.type = 'button';
  btnImportFile.id = 'taskAltImportFile';
  btnImportFile.className = btnRun.className;
  btnImportFile.textContent = 'File';

  if (actionsWrap) {
    const stack = document.createElement('div');
    stack.className = 'taskalt-actions-stack';

    const primaryRow = document.createElement('div');
    primaryRow.className = 'taskalt-actions-row';
    const secondaryRow = document.createElement('div');
    secondaryRow.className = 'taskalt-actions-row';

    importSlot = document.createElement('div');
    importSlot.className = 'taskalt-import-slot';
    primaryRow.appendChild(importSlot);
    primaryRow.appendChild(btnRun);
    primaryRow.appendChild(btnCopy);

    secondaryRow.appendChild(btnBaseline);
    secondaryRow.appendChild(btnRegression);

    stack.appendChild(primaryRow);
    stack.appendChild(secondaryRow);
    actionsWrap.insertBefore(stack, btnClose);
  }

  let selectedFiles = [];
  let results = [];
  let summaryText = '';
  let selectedIndex = -1;
  let filter = 'ALL';
  let previewMode = 'ORIGINAL'; // ORIGINAL | REGENERATED
  let regressionInfo = null;
  let importChoiceMode = false;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.yaml,.yml';
  fileInput.multiple = true;
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  const folderInput = document.createElement('input');
  folderInput.type = 'file';
  folderInput.accept = '.yaml,.yml';
  folderInput.multiple = true;
  folderInput.style.display = 'none';
  folderInput.setAttribute('webkitdirectory', '');
  folderInput.setAttribute('directory', '');
  document.body.appendChild(folderInput);

  const toYamlFiles = (list) =>
    Array.from(list || []).filter((f) => /\.(yaml|yml)$/i.test(String(f?.name || '')));

  const sortFilesByName = (files) =>
    Array.from(files || []).sort((a, b) => {
      const an = String(a?.name || '');
      const bn = String(b?.name || '');
      const byName = an.localeCompare(bn, undefined, { numeric: true, sensitivity: 'base' });
      if (byName !== 0) return byName;
      const ap = String(a?.webkitRelativePath || '');
      const bp = String(b?.webkitRelativePath || '');
      return ap.localeCompare(bp, undefined, { numeric: true, sensitivity: 'base' });
    });

  const applySelectedFiles = (files) => {
    selectedFiles = sortFilesByName(files);
    results = [];
    regressionInfo = null;
    selectedIndex = -1;
    renderLoadedFiles();
  };

  const showImportChoiceMode = () => {
    if (!importSlot) return;
    importChoiceMode = true;
    importSlot.innerHTML = '';
    importSlot.appendChild(btnImportFolder);
    importSlot.appendChild(btnImportFile);
  };

  const hideImportChoiceMode = () => {
    if (!importSlot) return;
    importChoiceMode = false;
    importSlot.innerHTML = '';
    importSlot.appendChild(btnImport);
  };

  hideImportChoiceMode();

  fileInput.addEventListener('change', () => {
    applySelectedFiles(toYamlFiles(fileInput.files));
    fileInput.value = '';
  });

  folderInput.addEventListener('change', () => {
    applySelectedFiles(toYamlFiles(folderInput.files));
    folderInput.value = '';
  });

  const ensureImportDebugPanel = () => {
    const host = $('generatedCode');
    if (!host) return null;
    let panel = $('importDebugPanel');
    if (!panel) {
      panel = document.createElement('details');
      panel.id = 'importDebugPanel';
      panel.open = true;
      panel.style.marginBottom = '8px';

      const sum = document.createElement('summary');
      sum.textContent = 'Imported JSON (normalized)';

      const pre = document.createElement('pre');
      pre.id = 'importDebugPre';
      pre.style.background = '#111827';
      pre.style.color = '#e5e7eb';
      pre.style.padding = '8px';
      pre.style.marginTop = '6px';
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.borderRadius = '6px';

      panel.appendChild(sum);
      panel.appendChild(pre);
      host.parentNode.insertBefore(panel, host);
    }
    return $('importDebugPre');
  };

  const showImportDebugJson = (obj) => {
    const pre = ensureImportDebugPanel();
    if (!pre) return;
    try {
      pre.textContent = JSON.stringify(obj, null, 2);
    } catch {
      pre.textContent = String(obj);
    }
  };

  const applyPreview = (res, idx) => {
    if (!res) return;
    const isOriginal = previewMode === 'ORIGINAL';
    const jsonToRender = isOriginal ? res.originalJson : res.regeneratedJson;
    const yamlToShow = isOriginal ? (res.originalText || '') : (res.regeneratedYaml || '');
    if (!jsonToRender) return;
    try {
      renderAutomationToWorkspace(ws, jsonToRender, { clearBefore: true });
      const codeEl = $('generatedCode');
      if (codeEl) codeEl.innerText = yamlToShow;
      showImportDebugJson(jsonToRender);
      selectedIndex = idx;
      renderResults();
    } catch (e) {
      out.textContent = `ERROR\n${String(e?.message || e)}`;
    }
  };

  const statusClass = (s) => {
    if (s === 'PASS') return 'pass';
    if (s === 'PASS_WITH_NORMALIZATION') return 'norm';
    if (s === 'PASS_WITH_RAW') return 'raw';
    return 'fail';
  };

  const formatStatusCounts = (counts) => {
    const keys = Object.keys(counts || {}).sort((a, b) => a.localeCompare(b));
    if (!keys.length) return '-';
    return keys.map((k) => `${k}=${counts[k]}`).join(', ');
  };

  const createStatusBadges = (counts) => {
    const row = document.createElement('div');
    row.className = 'taskalt-status-row';
    const keys = Object.keys(counts || {}).sort((a, b) => a.localeCompare(b));
    if (!keys.length) {
      const empty = document.createElement('span');
      empty.className = 'taskalt-status raw';
      empty.textContent = 'NO_STATUS';
      row.appendChild(empty);
      return row;
    }
    keys.forEach((status) => {
      const badge = document.createElement('span');
      badge.className = `taskalt-status ${statusClass(status)}`;
      badge.textContent = `${status}=${counts[status]}`;
      row.appendChild(badge);
    });
    return row;
  };

  const appendMetaRow = (container, label, value) => {
    const row = document.createElement('div');
    row.className = 'taskalt-meta-row';

    const key = document.createElement('span');
    key.className = 'taskalt-meta-key';
    key.textContent = label;

    const val = document.createElement('code');
    val.className = 'taskalt-meta-value';
    val.textContent = String(value ?? '-');

    row.appendChild(key);
    row.appendChild(val);
    container.appendChild(row);
  };

  const parseStatusDiff = (line) => {
    const m = String(line || '').match(/^([^:]+):\s*(.+?)\s*->\s*(.+)$/);
    if (!m) return null;
    return { name: m[1].trim(), from: m[2].trim(), to: m[3].trim() };
  };

  const parseCountDiff = (line) => {
    const m = String(line || '').match(
      /^([^:]+):\s*trigger\s*(\d+)->(\d+),\s*condition\s*(\d+)->(\d+),\s*action\s*(\d+)->(\d+)$/
    );
    if (!m) return null;
    return {
      name: m[1].trim(),
      trigger: [m[2], m[3]],
      condition: [m[4], m[5]],
      action: [m[6], m[7]],
    };
  };

  const parseRawDiff = (line) => {
    const m = String(line || '').match(/^([^:]+):\s*raw\s*(\d+)->(\d+)$/);
    if (!m) return null;
    return { name: m[1].trim(), from: m[2], to: m[3] };
  };

  const buildKeywordChangeModels = (report) => {
    const map = new Map();
    const ensure = (name) => {
      if (!map.has(name)) {
        map.set(name, {
          name,
          statusChange: null,
          countChange: null,
          rawChange: null,
          isNew: false,
          isMissing: false,
        });
      }
      return map.get(name);
    };

    (report?.statusDiff || []).forEach((line) => {
      const p = parseStatusDiff(line);
      if (!p) return;
      ensure(p.name).statusChange = { from: p.from, to: p.to };
    });

    (report?.countDiff || []).forEach((line) => {
      const p = parseCountDiff(line);
      if (!p) return;
      ensure(p.name).countChange = {
        trigger: p.trigger,
        condition: p.condition,
        action: p.action,
      };
    });

    (report?.rawDiff || []).forEach((line) => {
      const p = parseRawDiff(line);
      if (!p) return;
      ensure(p.name).rawChange = { from: p.from, to: p.to };
    });

    (report?.newFiles || []).forEach((name) => {
      ensure(String(name)).isNew = true;
    });

    (report?.missingFiles || []).forEach((name) => {
      ensure(String(name)).isMissing = true;
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  };

  const renderLoadedFiles = () => {
    out.innerHTML = '';
    if (!selectedFiles.length) {
      out.textContent = '(no files)';
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'taskalt-list taskalt-baseline-list';

    const summaryItem = document.createElement('div');
    summaryItem.className = 'taskalt-item';
    const summaryHead = document.createElement('div');
    summaryHead.className = 'taskalt-head';
    const summaryTitle = document.createElement('span');
    summaryTitle.className = 'taskalt-item-title';
    summaryTitle.textContent = 'Loaded Files';
    const summaryBadge = document.createElement('span');
    summaryBadge.className = 'taskalt-status norm';
    summaryBadge.textContent = `${selectedFiles.length} files`;
    summaryHead.appendChild(summaryTitle);
    summaryHead.appendChild(summaryBadge);
    summaryItem.appendChild(summaryHead);
    const summaryBody = document.createElement('div');
    summaryBody.className = 'taskalt-lines';
    summaryBody.textContent = 'Run을 눌러 분석하세요.';
    summaryItem.appendChild(summaryBody);
    wrap.appendChild(summaryItem);

    selectedFiles.forEach((f, i) => {
      const item = document.createElement('div');
      item.className = 'taskalt-item';
      const head = document.createElement('div');
      head.className = 'taskalt-head';
      const title = document.createElement('span');
      title.className = 'taskalt-item-title';
      title.textContent = `${i + 1}. ${f.name}`;
      const badge = document.createElement('span');
      badge.className = 'taskalt-status pass';
      badge.textContent = 'LOADED';
      head.appendChild(title);
      head.appendChild(badge);
      item.appendChild(head);
      wrap.appendChild(item);
    });

    out.appendChild(wrap);
  };

  const renderBaselineSnapshot = (snapshot) => {
    out.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'taskalt-list taskalt-baseline-list';

    const toolbar = document.createElement('div');
    toolbar.className = 'taskalt-filters taskalt-toolbar-tight';
    const spacer = document.createElement('span');
    spacer.className = 'taskalt-toolbar-spacer';
    toolbar.appendChild(spacer);
    toolbar.appendChild(btnBaselineClear);
    wrap.appendChild(toolbar);

    const keywords = Object.keys(snapshot?.keywords || {}).sort((a, b) => a.localeCompare(b));

    const summaryItem = document.createElement('div');
    summaryItem.className = 'taskalt-item';
    const summaryHead = document.createElement('div');
    summaryHead.className = 'taskalt-head';
    const summaryTitle = document.createElement('span');
    summaryTitle.className = 'taskalt-item-title';
    summaryTitle.textContent = 'Baseline Saved';
    const summaryBadge = document.createElement('span');
    summaryBadge.className = 'taskalt-status pass';
    summaryBadge.textContent = `${keywords.length} keywords`;
    summaryHead.appendChild(summaryTitle);
    summaryHead.appendChild(summaryBadge);
    summaryItem.appendChild(summaryHead);

    const summaryMeta = document.createElement('div');
    summaryMeta.className = 'taskalt-meta-list';
    appendMetaRow(summaryMeta, 'recordedAt', snapshot?.recordedAt || '-');
    summaryItem.appendChild(summaryMeta);
    wrap.appendChild(summaryItem);

    keywords.forEach((keyword) => {
      const files = snapshot?.keywords?.[keyword]?.files || {};
      const counts = {};
      for (const entry of Object.values(files)) {
        const s = String(entry?.status || 'UNKNOWN');
        counts[s] = Number(counts[s] || 0) + 1;
      }

      const item = document.createElement('div');
      item.className = 'taskalt-item';
      const head = document.createElement('div');
      head.className = 'taskalt-head';
      const title = document.createElement('span');
      title.className = 'taskalt-item-title';
      title.textContent = keyword;
      const badge = document.createElement('span');
      badge.className = 'taskalt-status norm';
      badge.textContent = `${Object.keys(files).length} files`;
      head.appendChild(title);
      head.appendChild(badge);
      item.appendChild(head);

      const statusWrap = createStatusBadges(counts);
      item.appendChild(statusWrap);
      wrap.appendChild(item);
    });

    out.appendChild(wrap);
  };

  const renderBaselineStore = (store, lastRecordedAt = '') => {
    out.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'taskalt-list';

    const toolbar = document.createElement('div');
    toolbar.className = 'taskalt-filters taskalt-toolbar-tight';
    const spacer = document.createElement('span');
    spacer.className = 'taskalt-toolbar-spacer';
    toolbar.appendChild(spacer);
    toolbar.appendChild(btnBaselineClear);
    wrap.appendChild(toolbar);

    const keywordsMap = (store && typeof store === 'object' && store.keywords && typeof store.keywords === 'object')
      ? store.keywords
      : {};
    const keywords = Object.keys(keywordsMap).sort((a, b) => a.localeCompare(b));

    const summaryItem = document.createElement('div');
    summaryItem.className = 'taskalt-item';
    const summaryHead = document.createElement('div');
    summaryHead.className = 'taskalt-head';
    const summaryTitle = document.createElement('span');
    summaryTitle.className = 'taskalt-item-title';
    summaryTitle.textContent = 'Baseline Saved';
    const summaryBadge = document.createElement('span');
    summaryBadge.className = 'taskalt-status pass';
    summaryBadge.textContent = `${keywords.length} keywords`;
    summaryHead.appendChild(summaryTitle);
    summaryHead.appendChild(summaryBadge);
    summaryItem.appendChild(summaryHead);

    const summaryMeta = document.createElement('div');
    summaryMeta.className = 'taskalt-meta-list';
    appendMetaRow(summaryMeta, 'updatedAt', store?.updatedAt || '-');
    appendMetaRow(summaryMeta, 'latest record', lastRecordedAt || '-');
    summaryItem.appendChild(summaryMeta);
    wrap.appendChild(summaryItem);

    keywords.forEach((keyword) => {
      const history = Array.isArray(keywordsMap[keyword]) ? keywordsMap[keyword] : [];
      const latest = history.length ? history[history.length - 1] : null;
      const files = (latest && latest.files && typeof latest.files === 'object') ? latest.files : {};

      const counts = {};
      for (const entry of Object.values(files)) {
        const s = String(entry?.status || 'UNKNOWN');
        counts[s] = Number(counts[s] || 0) + 1;
      }

      const item = document.createElement('div');
      item.className = 'taskalt-item';
      const head = document.createElement('div');
      head.className = 'taskalt-head';
      const title = document.createElement('span');
      title.className = 'taskalt-item-title';
      title.textContent = keyword;
      const badge = document.createElement('span');
      badge.className = 'taskalt-status norm';
      badge.textContent = `${Object.keys(files).length} files`;
      head.appendChild(title);
      head.appendChild(badge);
      item.appendChild(head);

      const meta = document.createElement('div');
      meta.className = 'taskalt-meta-list';
      appendMetaRow(meta, 'recordedAt', latest?.recordedAt || '-');
      item.appendChild(meta);

      const statusWrap = createStatusBadges(counts);
      item.appendChild(statusWrap);
      wrap.appendChild(item);
    });

    out.appendChild(wrap);
  };

  const renderResults = () => {
    out.innerHTML = '';
    if (!results.length) {
      out.textContent = '(no output)';
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'taskalt-list';

    if (regressionInfo) {
      const summaryItem = document.createElement('div');
      summaryItem.className = 'taskalt-item';

      const summaryHead = document.createElement('div');
      summaryHead.className = 'taskalt-head';
      const summaryTitle = document.createElement('span');
      summaryTitle.className = 'taskalt-item-title';
      summaryTitle.textContent = 'Regression Check';
      const summaryBadge = document.createElement('span');
      summaryBadge.className = `taskalt-status ${regressionInfo.ok ? 'pass' : 'fail'}`;
      summaryBadge.textContent = regressionInfo.ok ? 'PASS' : 'FAIL';
      summaryHead.appendChild(summaryTitle);
      summaryHead.appendChild(summaryBadge);
      summaryItem.appendChild(summaryHead);

      const comparedAt = regressionInfo?.model?.comparedAt || '-';
      const regCount = Number(regressionInfo?.model?.regressionCount || 0);
      const summaryMeta = document.createElement('div');
      summaryMeta.className = 'taskalt-meta-list';
      appendMetaRow(summaryMeta, 'comparedAt', comparedAt);
      appendMetaRow(summaryMeta, 'regressions', regCount);
      summaryItem.appendChild(summaryMeta);
      wrap.appendChild(summaryItem);

      const reports = Array.isArray(regressionInfo?.model?.keywordReports)
        ? regressionInfo.model.keywordReports
        : [];

      reports.forEach((r) => {
        const item = document.createElement('div');
        item.className = 'taskalt-item';

        const head = document.createElement('div');
        head.className = 'taskalt-head';
        const title = document.createElement('span');
        title.className = 'taskalt-item-title';
        title.textContent = r.keyword || 'unknown';
        const badge = document.createElement('span');
        if (r.skipped) {
          badge.className = 'taskalt-status raw';
          badge.textContent = 'SKIP';
        } else if (r.noDifferences) {
          badge.className = 'taskalt-status pass';
          badge.textContent = 'NO_DIFF';
        } else {
          badge.className = 'taskalt-status fail';
          badge.textContent = 'DIFF';
        }
        head.appendChild(title);
        head.appendChild(badge);
        item.appendChild(head);

        const meta = document.createElement('div');
        meta.className = 'taskalt-meta-list';
        appendMetaRow(meta, 'baseline recordedAt', r.baselineRecordedAt || '-');
        appendMetaRow(meta, 'comparedAt', r.comparedAt || '-');
        appendMetaRow(meta, 'baseline status', formatStatusCounts(r.baselineStatusCounts));
        appendMetaRow(meta, 'current status', formatStatusCounts(r.currentStatusCounts));
        item.appendChild(meta);

        if (r.skipped) {
          const note = document.createElement('div');
          note.className = 'taskalt-note raw';
          note.textContent = 'no baseline';
          item.appendChild(note);
        } else if (r.noDifferences) {
          const note = document.createElement('div');
          note.className = 'taskalt-note pass';
          note.textContent = 'no differences';
          item.appendChild(note);
        } else {
          const changes = buildKeywordChangeModels(r);
          const list = document.createElement('div');
          list.className = 'taskalt-change-list';

          changes.forEach((change) => {
            const row = document.createElement('div');
            row.className = 'taskalt-change-item';

            const rowHead = document.createElement('div');
            rowHead.className = 'taskalt-change-head';
            const nameBtn = document.createElement('button');
            nameBtn.type = 'button';
            nameBtn.className = 'taskalt-name-btn';
            nameBtn.textContent = change.name;
            nameBtn.addEventListener('click', () => {
              const idx = results.findIndex((x) => String(x?.name || '') === change.name);
              if (idx >= 0 && results[idx]) applyPreview(results[idx], idx);
            });
            rowHead.appendChild(nameBtn);

            if (change.statusChange) {
              const badge = document.createElement('span');
              badge.className = `taskalt-status ${statusClass(change.statusChange.to)}`;
              badge.textContent = `${change.statusChange.from} -> ${change.statusChange.to}`;
              rowHead.appendChild(badge);
            } else if (change.isNew) {
              const badge = document.createElement('span');
              badge.className = 'taskalt-status norm';
              badge.textContent = 'NEW';
              rowHead.appendChild(badge);
            } else if (change.isMissing) {
              const badge = document.createElement('span');
              badge.className = 'taskalt-status raw';
              badge.textContent = 'MISSING';
              rowHead.appendChild(badge);
            }

            row.appendChild(rowHead);

            const detail = document.createElement('div');
            detail.className = 'taskalt-change-body';

            if (change.countChange) {
              const count = document.createElement('div');
              count.className = 'taskalt-change-line';
              count.textContent = [
                `trigger ${change.countChange.trigger[0]}->${change.countChange.trigger[1]}`,
                `condition ${change.countChange.condition[0]}->${change.countChange.condition[1]}`,
                `action ${change.countChange.action[0]}->${change.countChange.action[1]}`,
              ].join(', ');
              detail.appendChild(count);
            }

            if (change.rawChange) {
              const raw = document.createElement('div');
              raw.className = 'taskalt-change-line';
              raw.textContent = `raw ${change.rawChange.from}->${change.rawChange.to}`;
              detail.appendChild(raw);
            }

            if (!detail.childNodes.length) {
              const empty = document.createElement('div');
              empty.className = 'taskalt-change-line';
              empty.textContent = 'status changed';
              detail.appendChild(empty);
            }

            row.appendChild(detail);
            list.appendChild(row);
          });

          item.appendChild(list);
        }
        wrap.appendChild(item);
      });

      if (!reports.length) {
        const empty = document.createElement('div');
        empty.className = 'taskalt-item';
        const text = document.createElement('div');
        text.className = 'taskalt-lines';
        text.textContent = 'No regression details.';
        empty.appendChild(text);
        wrap.appendChild(empty);
      }

      out.appendChild(wrap);
      return;
    }

    const filters = document.createElement('div');
    filters.className = 'taskalt-filters';
    const filterDefs = [
      ['ALL', 'All'],
      ['FAIL', 'FAIL'],
      ['RAW', 'RAW'],
    ];
    filterDefs.forEach(([key, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `taskalt-filter-btn${filter === key ? ' active' : ''}`;
      b.textContent = label;
      b.addEventListener('click', () => {
        filter = key;
        renderResults();
      });
      filters.appendChild(b);
    });

    const modeOriginal = document.createElement('button');
    modeOriginal.type = 'button';
    modeOriginal.className = `taskalt-filter-btn${previewMode === 'ORIGINAL' ? ' active' : ''}`;
    modeOriginal.textContent = 'Preview: Original';
    modeOriginal.addEventListener('click', () => {
      previewMode = 'ORIGINAL';
      if (selectedIndex >= 0 && results[selectedIndex]) applyPreview(results[selectedIndex], selectedIndex);
      else renderResults();
    });
    filters.appendChild(modeOriginal);

    const modeRegen = document.createElement('button');
    modeRegen.type = 'button';
    modeRegen.className = `taskalt-filter-btn${previewMode === 'REGENERATED' ? ' active' : ''}`;
    modeRegen.textContent = 'Preview: Regen';
    modeRegen.addEventListener('click', () => {
      previewMode = 'REGENERATED';
      if (selectedIndex >= 0 && results[selectedIndex]) applyPreview(results[selectedIndex], selectedIndex);
      else renderResults();
    });
    filters.appendChild(modeRegen);

    wrap.appendChild(filters);

    const filtered = results
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => {
        if (filter === 'FAIL') return r.status === 'FAIL' || r.status === 'ERROR';
        if (filter === 'RAW') return Array.isArray(r.rawInfo) && r.rawInfo.length > 0;
        return true;
      });

    filtered.forEach(({ r, i }) => {
      const item = document.createElement('div');
      item.className = `taskalt-item${selectedIndex === i ? ' selected' : ''}`;

      const head = document.createElement('div');
      head.className = 'taskalt-head';

      const nameBtn = document.createElement('button');
      nameBtn.type = 'button';
      nameBtn.className = 'taskalt-name-btn';
      nameBtn.textContent = r.name;
      nameBtn.addEventListener('click', () => applyPreview(r, i));

      const badge = document.createElement('span');
      badge.className = `taskalt-status ${statusClass(r.status)}`;
      badge.textContent = r.status;

      head.appendChild(nameBtn);
      head.appendChild(badge);

      const body = document.createElement('div');
      body.className = 'taskalt-lines';
      body.textContent = String(r.lines || '')
        .split('\n')
        .slice(1)
        .join('\n');

      item.appendChild(head);
      item.appendChild(body);
      wrap.appendChild(item);
    });

    out.appendChild(wrap);
  };

  const open = () => {
    hideImportChoiceMode();
    modal.classList.remove('hidden');
  };
  const close = () => {
    hideImportChoiceMode();
    modal.classList.add('hidden');
  };

  btn.addEventListener('click', open);
  backdrop?.addEventListener('click', close);
  btnClose?.addEventListener('click', close);

  btnImport.addEventListener('click', () => {
    if (importChoiceMode) hideImportChoiceMode();
    else showImportChoiceMode();
  });

  btnImportFile.addEventListener('click', () => {
    hideImportChoiceMode();
    fileInput.click();
  });

  btnImportFolder.addEventListener('click', () => {
    hideImportChoiceMode();
    folderInput.click();
  });

  btnRun.addEventListener('click', async () => {
    if (!selectedFiles.length) {
      out.textContent = '먼저 Import YAMLs로 파일을 선택하세요.';
      return;
    }
    out.textContent = '[RUN] analyzing...';
    try {
      const report = await runTaskAltBatch(selectedFiles, ws);
      results = Array.isArray(report?.results) ? report.results : [];
      saveLastResultsCache(results);
      summaryText = String(report?.summaryText || '');
      regressionInfo = null;
      selectedIndex = -1;
      renderResults();
    } catch (e) {
      out.textContent = `ERROR\n${String(e?.message || e)}`;
    }
  });

  btnCopy.addEventListener('click', async () => {
    const text = summaryText || out.textContent || '';
    await navigator.clipboard.writeText(text);
  });

  btnBaseline.addEventListener('click', () => {
    (async () => {
      if (!results.length) {
        const cached = loadLastResultsCache();
        if (cached.length) results = cached;
      }
      if (!results.length) {
        out.textContent = '저장 가능한 기존 결과가 없습니다. Run을 한 번 실행하세요.';
        return;
      }
      try {
        const snapshot = buildBaselineFromResults(results);
        const savedStore = await appendBaselineSnapshot(snapshot);
        summaryText = formatBaselineRecordSummary(snapshot);
        regressionInfo = null;
        renderBaselineStore(savedStore, snapshot?.recordedAt || '');
      } catch (e) {
        out.textContent = `ERROR\n${String(e?.message || e)}`;
      }
    })();
  });

  btnRegression.addEventListener('click', async () => {
    if (!selectedFiles.length) {
      out.textContent = '먼저 Import YAMLs로 파일을 선택하세요.';
      return;
    }
    out.textContent = '[REGRESSION] analyzing...';
    try {
      const baseline = await readBaselineFile();
      const report = await runTaskAltBatch(selectedFiles, ws);
      results = Array.isArray(report?.results) ? report.results : [];
      saveLastResultsCache(results);
      const regression = compareResultsWithBaseline(results, baseline);
      summaryText = regression.summaryText;
      regressionInfo = {
        ok: !Array.isArray(regression.regressions) || regression.regressions.length === 0,
        text: summaryText,
        model: regression.model || null,
      };
      selectedIndex = -1;
      renderResults();
    } catch (e) {
      out.textContent = `ERROR\n${String(e?.message || e)}`;
    }
  });

  btnBaselineClear.addEventListener('click', async () => {
    try {
      const cleared = await clearBaselineFile();
      regressionInfo = null;
      summaryText = [
        'BASELINE CLEARED',
        `- updatedAt: ${cleared?.updatedAt || ''}`,
      ].join('\n');
      renderBaselineStore(cleared, '');
    } catch (e) {
      out.textContent = `ERROR\n${String(e?.message || e)}`;
    }
  });
}
