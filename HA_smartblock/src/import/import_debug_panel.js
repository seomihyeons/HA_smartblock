export function ensureImportDebugPanel({ hostId = 'generatedCode' } = {}) {
  const host = document.getElementById(hostId);
  if (!host) return null;

  let panel = document.getElementById('importDebugPanel');
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

  return document.getElementById('importDebugPre');
}

export function showImportDebugJson(obj, { hostId = 'generatedCode' } = {}) {
  const pre = ensureImportDebugPanel({ hostId });
  if (!pre) return;

  const panel = document.getElementById('importDebugPanel');
  if (panel) {
    panel.open = true;
  }

  try {
    pre.textContent = JSON.stringify(obj, null, 2);
  } catch {
    pre.textContent = String(obj);
  }

  const outputPane = document.getElementById('outputPane');
  if (outputPane) {
    outputPane.scrollTop = 0;
  } else if (panel && typeof panel.scrollIntoView === 'function') {
    panel.scrollIntoView({ block: 'start' });
  }
}
