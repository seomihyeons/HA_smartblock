const http = require('http');
const https = require('https');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const DATA_DIR = process.env.HASSIO_DATA || '/data';
const FALLBACK_DATA_DIR = path.join(ROOT, 'data');
const BASELINE_FILE = path.join(DATA_DIR, 'task_alt_baseline.json');
const FALLBACK_BASELINE_FILE = path.join(FALLBACK_DATA_DIR, 'task_alt_baseline.json');
const PORT = Number(process.env.PORT || 8099);
const BASELINE_MAX_BYTES = 2 * 1024 * 1024;
const BASELINE_MAX_HISTORY = 10;
const PYTHON_CMD = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

function getHaApiBaseUrl() {
  return (process.env.HA_BASE_URL || 'http://supervisor/core/api').replace(/\/+$/, '');
}

function getHaCoreBaseUrl() {
  return getHaApiBaseUrl().replace(/\/api$/, '');
}

function requestJsonFromHa(apiPath) {
  const token = process.env.HA_TOKEN || process.env.SUPERVISOR_TOKEN || '';
  if (!token) {
    return Promise.reject(new Error('Missing SUPERVISOR_TOKEN/HA_TOKEN'));
  }

  const target = new URL(`${getHaApiBaseUrl()}${apiPath}`);
  const client = target.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(
      target,
      {
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
        },
        timeout: 15000,
      },
      (resp) => {
        let raw = '';
        resp.setEncoding('utf8');
        resp.on('data', (chunk) => { raw += chunk; });
        resp.on('end', () => {
          if ((resp.statusCode || 500) >= 400) {
            reject(new Error(`Home Assistant API returned ${resp.statusCode}: ${raw}`));
            return;
          }
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error('Home Assistant API returned invalid JSON'));
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Home Assistant API timed out')));
    req.on('error', reject);
    req.end();
  });
}

function normalizeHaEntityState(row) {
  const entityId = String(row?.entity_id || '').trim();
  if (!entityId || !entityId.includes('.')) return null;

  const attributes = (row.attributes && typeof row.attributes === 'object')
    ? row.attributes
    : {};
  return {
    entity_id: entityId,
    state: row.state,
    attributes,
    domain: entityId.split('.', 1)[0],
    friendly_name: attributes.friendly_name || entityId,
  };
}

async function sendRuntimeEntities(_req, res) {
  try {
    const states = await requestJsonFromHa('/states');
    const entities = (Array.isArray(states) ? states : [])
      .map(normalizeHaEntityState)
      .filter(Boolean)
      .sort((a, b) => a.entity_id.localeCompare(b.entity_id));

    const domains = [...new Set(entities.map((e) => e.domain))].sort();
    sendJson(res, 200, {
      source: 'homeassistant',
      count: entities.length,
      domains,
      entities,
    });
  } catch (e) {
    sendJson(res, 502, { error: String(e?.message || e) });
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, status, text, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type });
  res.end(text);
}

function createEmptyBaselineStore() {
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    keywords: {},
  };
}

async function getWritableBaselineFile() {
  try {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.access(DATA_DIR, fs.constants.W_OK);
    return BASELINE_FILE;
  } catch {
    await fsp.mkdir(FALLBACK_DATA_DIR, { recursive: true });
    return FALLBACK_BASELINE_FILE;
  }
}

async function readBody(req, maxBytes = BASELINE_MAX_BYTES) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > maxBytes) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const raw = await readBody(req);
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('invalid json body');
  }
}

function sanitizeFileEntry(data) {
  const allowedStatus = new Set(['PASS', 'PASS_WITH_NORMALIZATION', 'PASS_WITH_RAW', 'FAIL', 'ERROR']);
  const status = String(data?.status || 'ERROR');
  return {
    status: allowedStatus.has(status) ? status : 'ERROR',
    normStatus: String(data?.normStatus || ''),
    counts: {
      triggers: Number(data?.counts?.triggers || 0),
      conditions: Number(data?.counts?.conditions || 0),
      actions: Number(data?.counts?.actions || 0),
    },
    rawCount: Number(data?.rawCount || 0),
    rawTypes: Array.isArray(data?.rawTypes) ? data.rawTypes.map((x) => String(x)) : [],
  };
}

function sanitizeBaselineStore(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('invalid baseline payload');
  }

  const out = createEmptyBaselineStore();
  const srcKeywords = (
    payload.keywords &&
    typeof payload.keywords === 'object' &&
    !Array.isArray(payload.keywords)
  ) ? payload.keywords : {};

  for (const [keyword, history] of Object.entries(srcKeywords)) {
    const key = String(keyword || '').trim();
    if (!key || !Array.isArray(history)) continue;

    const safeHistory = [];
    for (const item of history.slice(-BASELINE_MAX_HISTORY)) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const rec = {
        recordedAt: String(item.recordedAt || ''),
        files: {},
      };
      const files = (
        item.files &&
        typeof item.files === 'object' &&
        !Array.isArray(item.files)
      ) ? item.files : {};
      for (const [name, data] of Object.entries(files)) {
        const fileName = String(name || '').trim();
        if (!fileName || !data || typeof data !== 'object' || Array.isArray(data)) continue;
        rec.files[fileName] = sanitizeFileEntry(data);
      }
      safeHistory.push(rec);
    }
    out.keywords[key] = safeHistory;
  }

  out.updatedAt = String(payload.updatedAt || new Date().toISOString());
  return out;
}

function sanitizeBaselineSnapshot(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('invalid baseline snapshot');
  }

  const out = {
    recordedAt: String(payload.recordedAt || new Date().toISOString()),
    keywords: {},
  };
  const srcKeywords = (
    payload.keywords &&
    typeof payload.keywords === 'object' &&
    !Array.isArray(payload.keywords)
  ) ? payload.keywords : {};

  for (const [keyword, data] of Object.entries(srcKeywords)) {
    const key = String(keyword || '').trim();
    if (!key || !data || typeof data !== 'object' || Array.isArray(data)) continue;
    const files = (
      data.files &&
      typeof data.files === 'object' &&
      !Array.isArray(data.files)
    ) ? data.files : {};
    const safeFiles = {};
    for (const [name, entry] of Object.entries(files)) {
      const fileName = String(name || '').trim();
      if (!fileName || !entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      safeFiles[fileName] = sanitizeFileEntry(entry);
    }
    out.keywords[key] = { files: safeFiles };
  }

  return out;
}

function mergeBaselineSnapshot(store, snapshot) {
  const next = sanitizeBaselineStore(store || createEmptyBaselineStore());
  const safeSnapshot = sanitizeBaselineSnapshot(snapshot || {});
  const recordedAt = String(safeSnapshot.recordedAt || new Date().toISOString());

  for (const [keyword, data] of Object.entries(safeSnapshot.keywords || {})) {
    if (!next.keywords[keyword]) next.keywords[keyword] = [];
    next.keywords[keyword].push({
      recordedAt,
      files: data?.files || {},
    });
    if (next.keywords[keyword].length > BASELINE_MAX_HISTORY) {
      next.keywords[keyword] = next.keywords[keyword].slice(-BASELINE_MAX_HISTORY);
    }
  }

  next.updatedAt = new Date().toISOString();
  return next;
}

async function readBaselineStore() {
  const file = await getWritableBaselineFile();
  try {
    const parsed = JSON.parse(await fsp.readFile(file, 'utf8'));
    return sanitizeBaselineStore(parsed);
  } catch {
    return createEmptyBaselineStore();
  }
}

async function writeBaselineStore(store) {
  const file = await getWritableBaselineFile();
  const normalized = sanitizeBaselineStore(store);
  normalized.updatedAt = new Date().toISOString();
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(normalized, null, 2) + '\n', 'utf8');
  return normalized;
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
  }[ext] || 'application/octet-stream';
}

function resolveStaticPath(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0] || '/');
  if (clean === '/' || clean === '') return path.join(DIST, 'index.html');

  const staticRoots = [
    { prefix: '/utils/', dir: path.join(ROOT, 'src', 'utils') },
    { prefix: '/', dir: DIST },
  ];

  for (const root of staticRoots) {
    if (!clean.startsWith(root.prefix)) continue;
    const rel = clean.slice(root.prefix.length).replace(/^[/\\]+/, '');
    const candidate = path.resolve(root.dir, rel);
    if (!candidate.startsWith(path.resolve(root.dir))) return null;
    return candidate;
  }

  return null;
}

async function serveStatic(req, res) {
  const filePath = resolveStaticPath(req.url || '/');
  if (!filePath) {
    sendText(res, 404, 'Not found');
    return;
  }

  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) throw new Error('not a file');
    res.writeHead(200, { 'content-type': getMimeType(filePath) });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    const fallback = path.join(DIST, 'index.html');
    try {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      fs.createReadStream(fallback).pipe(res);
    } catch {
      sendText(res, 404, 'Not found');
    }
  }
}

async function proxyHomeAssistant(req, res) {
  const token = process.env.HA_TOKEN || process.env.SUPERVISOR_TOKEN || '';
  const base = getHaApiBaseUrl();
  if (!token) {
    sendJson(res, 503, { error: 'Missing SUPERVISOR_TOKEN/HA_TOKEN' });
    return;
  }

  const upstreamPath = (req.url || '').replace(/^\/ha\/api/, '');
  const target = new URL(`${base}${upstreamPath}`);
  const rawBody = ['GET', 'HEAD'].includes(req.method || 'GET') ? null : await readBody(req, 10 * 1024 * 1024);
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.cookie;
  headers.authorization = `Bearer ${token}`;

  const upstream = http.request(
    target,
    {
      method: req.method,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );

  upstream.on('error', (err) => {
    sendJson(res, 502, { error: `Home Assistant proxy failed: ${err.message}` });
  });

  if (rawBody) upstream.write(rawBody);
  upstream.end();
}

async function runAnalyzer(req, res) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (e) {
    sendJson(res, 400, { error: e.message });
    return;
  }

  const mode = payload?.mode || 'yaml';
  const yamlText = payload?.yaml || '';
  if (mode !== 'ha' && !yamlText) {
    sendJson(res, 400, { error: 'Missing body.yaml' });
    return;
  }

  const pyPath = path.join(ROOT, 'src', 'homeassistant', 'conflict_analyzer', 'ha_eca_conflict_analyzer.py');
  const args = mode === 'ha'
    ? [pyPath, '--ha', '--out', 'stdout', '--concurrency', String(payload?.concurrency ?? 8)]
    : [pyPath, '--out', 'stdout'];

  const child = spawn(PYTHON_CMD, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HA_BASE_URL: getHaCoreBaseUrl(),
      HA_TOKEN: process.env.HA_TOKEN || process.env.SUPERVISOR_TOKEN || '',
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
    },
  });

  let out = '';
  let err = '';
  child.stdout.on('data', (chunk) => { out += chunk.toString(); });
  child.stderr.on('data', (chunk) => { err += chunk.toString(); });
  child.on('close', (code) => {
    if (code !== 0) {
      sendJson(res, 500, { error: `python exited ${code}`, stderr: err, stdout: out });
      return;
    }
    try {
      sendJson(res, 200, { report: JSON.parse(out), stderr: err });
    } catch {
      sendJson(res, 500, { error: 'Failed to parse python stdout as JSON', stdout: out, stderr: err });
    }
  });

  if (mode !== 'ha') child.stdin.write(yamlText);
  child.stdin.end();
}

async function handleBaseline(req, res) {
  try {
    if (req.method === 'GET' && req.url === '/api/task-alt/baseline') {
      sendJson(res, 200, await readBaselineStore());
      return;
    }
    if (req.method === 'PUT' && req.url === '/api/task-alt/baseline') {
      const payload = await readJsonBody(req);
      sendJson(res, 200, await writeBaselineStore(payload));
      return;
    }
    if (req.method === 'POST' && req.url === '/api/task-alt/baseline/snapshot') {
      const snapshot = await readJsonBody(req);
      const current = await readBaselineStore();
      sendJson(res, 200, await writeBaselineStore(mergeBaselineSnapshot(current, snapshot)));
      return;
    }
    if (req.method === 'DELETE' && req.url === '/api/task-alt/baseline') {
      sendJson(res, 200, await writeBaselineStore(createEmptyBaselineStore()));
      return;
    }
    sendJson(res, 404, { error: 'not found' });
  } catch (e) {
    const msg = String(e?.message || e);
    const code = msg.includes('payload too large') || msg.includes('invalid') ? 400 : 500;
    sendJson(res, code, { error: msg });
  }
}

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';

  if (url.startsWith('/ha/api')) {
    proxyHomeAssistant(req, res);
    return;
  }

  if (req.method === 'GET' && url.split('?')[0] === '/api/entities') {
    sendRuntimeEntities(req, res);
    return;
  }

  if (req.method === 'POST' && url === '/analyze') {
    runAnalyzer(req, res);
    return;
  }

  if (url.startsWith('/api/task-alt/baseline')) {
    handleBaseline(req, res);
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`HA SmartBlock add-on server listening on port ${PORT}`);
});
