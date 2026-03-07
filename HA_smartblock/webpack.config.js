const path = require('path');
const fs = require('fs/promises');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const dotenv = require('dotenv');

dotenv.config();
console.log('[dotenv]', process.cwd());

const BASELINE_FILE = path.resolve(__dirname, 'test', 'task_alt', 'baseline.json');
const BASELINE_MAX_BYTES = 2 * 1024 * 1024;
const BASELINE_MAX_HISTORY = 10;

function createEmptyBaselineStore() {
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    keywords: {},
  };
}

function isLocalAddress(addr) {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req, maxBytes = BASELINE_MAX_BYTES) {
  if (req.body && typeof req.body === 'object') return req.body;

  return new Promise((resolve, reject) => {
    let size = 0;
    let raw = '';
    let done = false;

    const finish = (fn, value) => {
      if (done) return;
      done = true;
      fn(value);
    };

    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      if (done) return;
      size += Buffer.byteLength(chunk);
      if (size > maxBytes) {
        finish(reject, new Error('payload too large'));
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      if (done) return;
      if (!raw.trim()) {
        finish(resolve, {});
        return;
      }
      try {
        finish(resolve, JSON.parse(raw));
      } catch {
        finish(reject, new Error('invalid json body'));
      }
    });
    req.on('error', (err) => finish(reject, err));
  });
}

function sanitizeBaselineStore(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('invalid baseline payload');
  }

  const out = createEmptyBaselineStore();
  const srcKeywords = (payload.keywords && typeof payload.keywords === 'object' && !Array.isArray(payload.keywords))
    ? payload.keywords
    : {};

  const allowedStatus = new Set(['PASS', 'PASS_WITH_NORMALIZATION', 'PASS_WITH_RAW', 'FAIL', 'ERROR']);
  const sanitizeFileEntry = (data) => {
    const status = String(data.status || 'ERROR');
    const statusValue = allowedStatus.has(status) ? status : 'ERROR';
    return {
      status: statusValue,
      normStatus: String(data.normStatus || ''),
      counts: {
        triggers: Number(data.counts?.triggers || 0),
        conditions: Number(data.counts?.conditions || 0),
        actions: Number(data.counts?.actions || 0),
      },
      rawCount: Number(data.rawCount || 0),
      rawTypes: Array.isArray(data.rawTypes) ? data.rawTypes.map((x) => String(x)) : [],
    };
  };

  for (const [keyword, history] of Object.entries(srcKeywords)) {
    const key = String(keyword || '').trim();
    if (!key) continue;
    if (!Array.isArray(history)) continue;

    const safeHistory = [];
    for (const item of history.slice(-BASELINE_MAX_HISTORY)) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const rec = {
        recordedAt: String(item.recordedAt || ''),
        files: {},
      };
      const files = (item.files && typeof item.files === 'object' && !Array.isArray(item.files)) ? item.files : {};
      for (const [name, data] of Object.entries(files)) {
        const fileName = String(name || '').trim();
        if (!fileName) continue;
        if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
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

  const srcKeywords = (payload.keywords && typeof payload.keywords === 'object' && !Array.isArray(payload.keywords))
    ? payload.keywords
    : {};

  const allowedStatus = new Set(['PASS', 'PASS_WITH_NORMALIZATION', 'PASS_WITH_RAW', 'FAIL', 'ERROR']);
  const sanitizeFileEntry = (data) => {
    const status = String(data.status || 'ERROR');
    const statusValue = allowedStatus.has(status) ? status : 'ERROR';
    return {
      status: statusValue,
      normStatus: String(data.normStatus || ''),
      counts: {
        triggers: Number(data.counts?.triggers || 0),
        conditions: Number(data.counts?.conditions || 0),
        actions: Number(data.counts?.actions || 0),
      },
      rawCount: Number(data.rawCount || 0),
      rawTypes: Array.isArray(data.rawTypes) ? data.rawTypes.map((x) => String(x)) : [],
    };
  };

  for (const [keyword, data] of Object.entries(srcKeywords)) {
    const key = String(keyword || '').trim();
    if (!key) continue;
    if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
    const files = (data.files && typeof data.files === 'object' && !Array.isArray(data.files)) ? data.files : {};
    const safeFiles = {};
    for (const [name, entry] of Object.entries(files)) {
      const fileName = String(name || '').trim();
      if (!fileName) continue;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
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

async function readBaselineStoreFromDisk() {
  try {
    const text = await fs.readFile(BASELINE_FILE, 'utf8');
    const parsed = JSON.parse(text);
    return sanitizeBaselineStore(parsed);
  } catch (e) {
    if (e && e.code === 'ENOENT') return createEmptyBaselineStore();
    return createEmptyBaselineStore();
  }
}

async function writeBaselineStoreToDisk(store) {
  const normalized = sanitizeBaselineStore(store);
  normalized.updatedAt = new Date().toISOString();

  await fs.mkdir(path.dirname(BASELINE_FILE), { recursive: true });
  const tempFile = `${BASELINE_FILE}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(normalized, null, 2) + '\n', 'utf8');
  try {
    await fs.unlink(BASELINE_FILE);
  } catch (e) {
    if (!e || e.code !== 'ENOENT') throw e;
  }
  await fs.rename(tempFile, BASELINE_FILE);

  return normalized;
}

const config = {
  entry: './src/index.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  devServer: {
    static: './build',
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: 'src/index.html',
    }),
  ],
};

module.exports = (env, argv) => {
  if (argv.mode === 'development') {
    config.output.path = path.resolve(__dirname, 'build');

    config.devtool = 'eval-cheap-module-source-map';

    config.devServer = {
      host: process.env.DEV_SERVER_HOST || '127.0.0.1',
      port: 8080,
      hot: true,
      historyApiFallback: true,
      static: [
        { directory: path.resolve(__dirname, 'build') },
        { directory: path.resolve(__dirname, 'src', 'utils'), publicPath: '/utils', watch: false },
      ],

      proxy: {
        '/ha/api': {
          target: process.env.HA_BASE_URL,
          changeOrigin: true,
          secure: false,
          ws: true,
          pathRewrite: { '^/ha': '' },
          onProxyReq: (proxyReq) => {
            const token = process.env.HA_TOKEN;
            if (token) {
              proxyReq.setHeader('Authorization', `Bearer ${token}`);
            }
          },
        },

        '/analyze': {
          target: 'http://localhost:8787',
          changeOrigin: true,
          secure: false,
        },
      },

      setupMiddlewares: (middlewares, devServer) => {
        const app = devServer?.app;
        if (!app) return middlewares;

        app.use((req, res, next) => {
          const url = String(req.url || '');
          if (url.startsWith('/ha/api') || url.startsWith('/analyze')) {
            const addr = String(req.socket?.remoteAddress || '');
            if (!isLocalAddress(addr)) {
              sendJson(res, 403, { error: 'forbidden' });
              return;
            }
          }
          next();
        });

        const guardLocal = (req, res) => {
          const addr = String(req.socket?.remoteAddress || '');
          if (!isLocalAddress(addr)) {
            sendJson(res, 403, { error: 'forbidden' });
            return false;
          }
          return true;
        };

        app.get('/api/task-alt/baseline', async (req, res) => {
          if (!guardLocal(req, res)) return;
          try {
            const store = await readBaselineStoreFromDisk();
            sendJson(res, 200, store);
          } catch (e) {
            sendJson(res, 500, { error: String(e?.message || e) });
          }
        });

        app.put('/api/task-alt/baseline', async (req, res) => {
          if (!guardLocal(req, res)) return;
          try {
            const payload = await readJsonBody(req, BASELINE_MAX_BYTES);
            const saved = await writeBaselineStoreToDisk(payload);
            sendJson(res, 200, saved);
          } catch (e) {
            const msg = String(e?.message || e);
            const code = msg.includes('payload too large') || msg.includes('invalid')
              ? 400
              : 500;
            sendJson(res, code, { error: msg });
          }
        });

        app.post('/api/task-alt/baseline/snapshot', async (req, res) => {
          if (!guardLocal(req, res)) return;
          try {
            const snapshot = await readJsonBody(req, BASELINE_MAX_BYTES);
            const current = await readBaselineStoreFromDisk();
            const merged = mergeBaselineSnapshot(current, snapshot);
            const saved = await writeBaselineStoreToDisk(merged);
            sendJson(res, 200, saved);
          } catch (e) {
            const msg = String(e?.message || e);
            const code = msg.includes('payload too large') || msg.includes('invalid')
              ? 400
              : 500;
            sendJson(res, code, { error: msg });
          }
        });

        app.delete('/api/task-alt/baseline', async (req, res) => {
          if (!guardLocal(req, res)) return;
          try {
            const cleared = await writeBaselineStoreToDisk(createEmptyBaselineStore());
            sendJson(res, 200, cleared);
          } catch (e) {
            sendJson(res, 500, { error: String(e?.message || e) });
          }
        });

        return middlewares;
      },
    };

    config.module.rules.push({
      test: /(blockly\/.*\.js)$/,
      use: [require.resolve('source-map-loader')],
      enforce: 'pre',
    });

    config.ignoreWarnings = [/Failed to parse source map/];
  }
  return config;
};
