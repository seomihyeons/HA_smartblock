import { pushYamlToHomeAssistant } from './homeassistant/push_automation';

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
    wrap.style.marginTop = '8px';

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
        alert('내보낼 YAML이 없습니다.');
        return;
      }
      const alias = extractAliasForFilename(yaml);
      const filename = toSafeFilename(alias || 'automation');
      downloadYamlFile(yaml, filename);
    });

    copyBtn.addEventListener('click', async () => {
      const yaml = getYamlText(outputId);
      if (!yaml.trim()) {
        alert('복사할 YAML이 없습니다.');
        return;
      }
      try {
        await navigator.clipboard.writeText(yaml);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => (copyBtn.textContent = 'Copy YAML'), 1200);
      } catch (err) {
        console.error(err);
        alert('클립보드 복사에 실패했습니다.');
      }
    });

    pushBtn.addEventListener('click', async () => {
      const yaml = getYamlText(outputId);
      if (!yaml.trim()) return alert('보낼 YAML이 없습니다.');

      pushBtn.disabled = true;
      const prev = pushBtn.textContent;
      pushBtn.textContent = 'Pushing...';

      try {
        const result = await pushYamlToHomeAssistant(yaml, {});
        pushBtn.textContent = 'Pushed!';
        setTimeout(() => (pushBtn.textContent = prev), 1200);
        alert(`Home Assistant에 반영 완료!\n- id: ${result.id}\n- alias: ${result.alias}`);
      } catch (e) {
        console.error(e);
        alert(`HA 푸시 실패\n${e?.message || e}`);
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
