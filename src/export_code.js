import { pushYamlToHomeAssistant } from './homeassistant/push_automation';
import { generateScopedYaml, getDisconnectedBlockGroups } from './utils/automation_yaml_scope.js';
import { confirmDisconnectedBlocks, confirmPushToHomeAssistant } from './utils/unsaved_changes_dialog.js';

function getYamlText(outputId) {
  const el = document.getElementById(outputId);
  return el ? el.innerText : '';
}

function getScopedYamlText(ws, outputId) {
  return ws ? generateScopedYaml(ws) : getYamlText(outputId);
}

async function confirmDisconnectedBlocksBeforeOutput(ws) {
  const count = getDisconnectedBlockGroups(ws).length;
  return count === 0 || confirmDisconnectedBlocks({ count });
}

function toSafeFilename(name, fallback = 'automation') {
  const base = (name || '').trim() || fallback;
  return base.replace(/[\\/:*?"<>|]/g, '_');
}

function extractAliasForFilename(yaml) {
  const m = yaml.match(/^\s*-?\s*alias:\s*['"]?(.+?)['"]?\s*$/m);
  return m ? m[1].replace(/^['"]|['"]$/g, '') : null;
}

function extractIdForPushPreview(yaml) {
  // The YAML generator writes top-level fields in a list item with two spaces
  // of indentation (for example, `  id: 'sb_example'`). Do not match nested
  // trigger/action IDs here.
  const m = yaml.match(/^ {2}id:\s*['"]?(.+?)['"]?\s*$/m);
  return m ? m[1].replace(/^['"]|['"]$/g, '') : null;
}

function findAutomationRootBlock(ws) {
  if (!ws || typeof ws.getTopBlocks !== 'function') return null;
  const roots = ws.getTopBlocks(true);
  return roots.find((block) => (
    block
    && (block.type === 'event_action' || block.type === 'event_condition_action')
    && ['EVENT', 'CONDITION', 'ACTION'].some((inputName) => block.getInputTargetBlock?.(inputName))
  )) || null;
}

function hasMeaningfulId(block) {
  if (!block || typeof block.getFieldValue !== 'function') return false;
  const value = String(block.getFieldValue('ID') || '').trim();
  return Boolean(value && value !== '(Optional)');
}

function persistGeneratedAutomationId(ws, outputId, id) {
  if (!ws || !id) return;
  const root = findAutomationRootBlock(ws);
  if (!root || hasMeaningfulId(root) || !root.getField('ID')) return;

  root.setFieldValue(String(id), 'ID');

  const host = document.getElementById(outputId);
  if (host) {
    host.innerText = generateScopedYaml(ws);
  }
}

function downloadYamlFile(yaml, filename) {
  const blob = new Blob([yaml], { type: 'text/yaml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.yaml') ? filename : `${filename}.yaml`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

export function setupYamlExportButtons(outputId = 'generatedCode', ws = null, { onPushSuccess } = {}) {
  function ensureExportButtons() {
    const host = document.getElementById(outputId);
    if (!host) return;

    if (document.getElementById('yamlButtons')) return;

    const wrap = document.createElement('div');
    wrap.id = 'yamlButtons';
    wrap.style.marginTop = '2px';

    const exportBtn = document.createElement('button');
    exportBtn.id = 'exportYamlBtn';
    exportBtn.textContent = 'Export YAML';

    const copyBtn = document.createElement('button');
    copyBtn.id = 'copyYamlBtn';
    copyBtn.textContent = 'Copy YAML';
    copyBtn.style.marginLeft = '6px';

    const pushBtn = document.createElement('button');
    pushBtn.id = 'pushHaBtn';
    pushBtn.textContent = 'Push to HA';
    pushBtn.style.marginLeft = '6px';

    wrap.appendChild(exportBtn);
    wrap.appendChild(copyBtn);
    wrap.appendChild(pushBtn);
    host.parentNode.insertBefore(wrap, host.nextSibling);

    exportBtn.addEventListener('click', async () => {
      if (!await confirmDisconnectedBlocksBeforeOutput(ws)) return;
      const yaml = getScopedYamlText(ws, outputId);
      if (!yaml.trim()) {
        alert('There is no YAML to export.');
        return;
      }
      const alias = extractAliasForFilename(yaml);
      const filename = toSafeFilename(alias || 'automation');
      downloadYamlFile(yaml, filename);
    });

    copyBtn.addEventListener('click', async () => {
      if (!await confirmDisconnectedBlocksBeforeOutput(ws)) return;
      const yaml = getScopedYamlText(ws, outputId);
      if (!yaml.trim()) {
        alert('There is no YAML to copy.');
        return;
      }
      try {
        await navigator.clipboard.writeText(yaml);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => (copyBtn.textContent = 'Copy YAML'), 1200);
      } catch (err) {
        console.error(err);
        alert('Failed to copy YAML to the clipboard.');
      }
    });

    pushBtn.addEventListener('click', async () => {
      if (!await confirmDisconnectedBlocksBeforeOutput(ws)) return;
      const yaml = getScopedYamlText(ws, outputId);
      if (!yaml.trim()) return alert('There is no YAML to push.');

      const confirmed = await confirmPushToHomeAssistant({
        name: extractAliasForFilename(yaml),
        id: extractIdForPushPreview(yaml),
      });
      if (!confirmed) return;

      pushBtn.disabled = true;
      const prev = pushBtn.textContent;
      pushBtn.textContent = 'Pushing...';

      try {
        const result = await pushYamlToHomeAssistant(yaml, {});
        if (result?.idWasGenerated) {
          persistGeneratedAutomationId(ws, outputId, result.id);
        }
        pushBtn.textContent = 'Pushed!';
        setTimeout(() => (pushBtn.textContent = prev), 1200);
        onPushSuccess?.();
      } catch (e) {
        console.error(e);
        alert(`Failed to push to Home Assistant\n${e?.message || e}`);
        pushBtn.textContent = prev;
      } finally {
        pushBtn.disabled = false;
      }
    });

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureExportButtons);
  } else {
    ensureExportButtons();
  }

  if (ws && typeof ws.addChangeListener === 'function') {
    ws.addChangeListener(() => ensureExportButtons());
  }
}
