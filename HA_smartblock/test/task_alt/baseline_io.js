const BASELINE_API = '/api/task-alt/baseline';
const BASELINE_SNAPSHOT_API = '/api/task-alt/baseline/snapshot';

async function parseJsonResponse(resp) {
  const text = await resp.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: 'Invalid JSON response' };
  }
}

export async function readBaselineFile() {
  const resp = await fetch(BASELINE_API, { method: 'GET' });
  const body = await parseJsonResponse(resp);
  if (!resp.ok) {
    const msg = body?.error || `baseline read failed (${resp.status})`;
    throw new Error(msg);
  }
  return body;
}

export async function writeBaselineFile(store) {
  const resp = await fetch(BASELINE_API, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(store),
  });
  const body = await parseJsonResponse(resp);
  if (!resp.ok) {
    const msg = body?.error || `baseline write failed (${resp.status})`;
    throw new Error(msg);
  }
  return body;
}

export async function appendBaselineSnapshot(snapshot) {
  const resp = await fetch(BASELINE_SNAPSHOT_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot),
  });
  const body = await parseJsonResponse(resp);
  if (!resp.ok) {
    const msg = body?.error || `baseline append failed (${resp.status})`;
    throw new Error(msg);
  }
  return body;
}

export async function clearBaselineFile() {
  const resp = await fetch(BASELINE_API, { method: 'DELETE' });
  const body = await parseJsonResponse(resp);
  if (!resp.ok) {
    const msg = body?.error || `baseline clear failed (${resp.status})`;
    throw new Error(msg);
  }
  return body;
}
