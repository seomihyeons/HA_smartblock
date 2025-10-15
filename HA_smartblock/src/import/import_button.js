// src/import/import_button.js
export function setupYamlImportButton(arg1, arg2) {
  const opts = (typeof arg1 === 'string') ? { outputId: arg1, ws: arg2 } : (arg1 || {});
  const outputId = opts.outputId || 'generatedCode';
  const ws = opts.ws || null;

  function mountOnce() {
    const host = document.getElementById(outputId);
    if (!host) return false;

    let wrap = document.getElementById('yamlButtons');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'yamlButtons';
      wrap.style.marginTop = '8px';
      host.parentNode.insertBefore(wrap, host.nextSibling);
    }
    if (document.getElementById('importYamlBtn')) return true;

    const btn = document.createElement('button');
    btn.id = 'importYamlBtn';
    btn.textContent = 'Import YAML';
    btn.style.marginRight = '6px';

    const file = document.createElement('input');
    file.type = 'file';
    file.accept = '.yaml,.yml';
    file.style.display = 'none';

    btn.addEventListener('click', () => file.click());
    file.addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const text = await f.text();
      console.log('[import] file loaded:', f.name, 'bytes=', text.length);
      document.dispatchEvent(new CustomEvent('yaml-imported', { detail: { text } }));
      file.value = '';
    });

    const exportBtn = document.getElementById('exportYamlBtn');
    if (exportBtn && exportBtn.parentNode === wrap) wrap.insertBefore(btn, exportBtn);
    else wrap.appendChild(btn);

    wrap.appendChild(file);
    return true;
  }

  const tryMount = () => { if (!mountOnce()) setTimeout(tryMount, 50); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryMount, { once: true });
  else tryMount();

  if (ws && typeof ws.addChangeListener === 'function') ws.addChangeListener(() => mountOnce());
}
