import { pushYamlToHomeAssistant } from './homeassistant/push_automation';
import { yamlGenerator } from './generators/yaml';

function getYamlText(outputId) {
  const el = document.getElementById(outputId);
  return el ? el.innerText : '';
}

function toSafeFilename(name, fallback = 'automation') {
  const base = (name || '').trim() || fallback;
  return base.replace(/[\\/:*?"<>|]/g, '_');
}

function extractAliasForFilename(yaml) {
  const m = yaml.match(/^\s*-?\s*alias:\s*['"]?(.+?)['"]?\s*$/m);
  return m ? m[1].replace(/^['"]|['"]$/g, '') : null;
}

function findAutomationRootBlock(ws) {
  if (!ws || typeof ws.getTopBlocks !== 'function') return null;
  const roots = ws.getTopBlocks(true);
  return roots.find((block) => block && (block.type === 'event_action' || block.type === 'event_condition_action')) || null;
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
    host.innerText = yamlGenerator.workspaceToCode(ws);
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

export function setupYamlExportButtons(outputId = 'generatedCode', ws = null) {
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

    exportBtn.addEventListener('click', () => {
      const yaml = getYamlText(outputId);
      if (!yaml.trim()) {
        alert('There is no YAML to export.');
        return;
      }
      const alias = extractAliasForFilename(yaml);
      const filename = toSafeFilename(alias || 'automation');
      downloadYamlFile(yaml, filename);
    });

    copyBtn.addEventListener('click', async () => {
      const yaml = getYamlText(outputId);
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
      const yaml = getYamlText(outputId);
      if (!yaml.trim()) return alert('There is no YAML to push.');

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
        alert(`Successfully pushed to Home Assistant\n\n- Alias: ${result.alias}\n- ID: ${result.id}`);
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
