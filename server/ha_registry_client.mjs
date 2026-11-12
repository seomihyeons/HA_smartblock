/**
 * Read-only Home Assistant registry client; no registry data is sent raw to LLMs.
 * Fetches Area, Device and Entity registries in parallel over ONE WebSocket.
 */
import WebSocket from 'ws';

export const HA_REGISTRY_TYPES = Object.freeze([
  'config/area_registry/list',
  'config/device_registry/list',
  'config/entity_registry/list',
]);

export function homeAssistantWebSocketUrl(baseUrl) {
  const url = new URL(String(baseUrl || ''));
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Home Assistant base URL must use http(s)');
  if (url.username || url.password || url.search || url.hash)
    throw new Error('Home Assistant base URL must not contain credentials or query parameters');
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = url.pathname.replace(/\/$/, '') + '/api/websocket';
  return url.toString();
}

export function fetchHomeAssistantRegistries({
  baseUrl, token, timeoutMs = 3000, WebSocketImpl = WebSocket,
} = {}) {
  if (!baseUrl || !token)
    return Promise.reject(new Error('Home Assistant registry credentials are missing'));
  const url = homeAssistantWebSocketUrl(baseUrl);

  return new Promise((resolve, reject) => {
    let socket;
    let settled = false;
    let authenticated = false;
    let timer;
    const replies = new Map();

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket?.close(); } catch { /* socket might already be closed */ }
      if (err) reject(err);
      else resolve(value);
    };

    try { socket = new WebSocketImpl(url, { maxPayload: 16 * 1024 * 1024 }); }
    catch { finish(new Error('Unable to establish Home Assistant registry WebSocket')); return; }
    timer = setTimeout(() => finish(new Error('Home Assistant registry WebSocket timeout')), timeoutMs);

    socket.on('message', (raw) => {
      if (settled) return;
      let msg;
      try { msg = JSON.parse(String(raw)); }
      catch { finish(new Error('Invalid Home Assistant WebSocket message')); return; }

      if (msg.type === 'auth_required') {
        try { socket.send(JSON.stringify({ type: 'auth', access_token: token })); }
        catch { finish(new Error('Home Assistant registry authentication could not be sent')); }
        return;
      }
      if (msg.type === 'auth_invalid') {
        finish(new Error('Home Assistant registry authentication rejected'));
        return;
      }
      if (msg.type === 'auth_ok') {
        if (authenticated) return;
        authenticated = true;
        for (let i = 0; i < HA_REGISTRY_TYPES.length; i++) {
          try { socket.send(JSON.stringify({ id: i + 1, type: HA_REGISTRY_TYPES[i] })); }
          catch { finish(new Error('Home Assistant registry request failed')); return; }
        }
        return;
      }
      if (!authenticated || msg.type !== 'result') return;
      if (!Number.isInteger(msg.id) || msg.id < 1 || msg.id > HA_REGISTRY_TYPES.length) return;
      if (!msg.success || !Array.isArray(msg.result)) {
        finish(new Error('Home Assistant registry returned an unsuccessful response'));
        return;
      }
      replies.set(msg.id, msg.result);
      if (replies.size === HA_REGISTRY_TYPES.length) {
        finish(null, {
          areas: replies.get(1).map(a => ({ area_id: a.area_id, name: a.name })),
          devices: replies.get(2).map(d => ({ id: d.id, area_id: d.area_id })),
          entities: replies.get(3).map(e => ({
            entity_id: e.entity_id, device_id: e.device_id, area_id: e.area_id,
          })),
        });
      }
    });
    socket.on('error', () => finish(new Error('Home Assistant registry WebSocket connection failed')));
    socket.on('close', () => finish(new Error('Home Assistant registry WebSocket closed prematurely')));
  });
}

/** Explicit entity area takes precedence over inherited device area. */
export function areaNamesByEntity(snapshot) {
  if (!snapshot) return new Map();
  const areas = new Map((snapshot.areas || [])
    .filter(a => typeof a?.area_id === 'string' && typeof a?.name === 'string')
    .map(a => [a.area_id, a.name]));
  const deviceAreas = new Map((snapshot.devices || [])
    .filter(d => typeof d?.id === 'string')
    .map(d => [d.id, d.area_id || null]));
  const result = new Map();
  for (const entity of snapshot.entities || []) {
    if (typeof entity?.entity_id !== 'string' || !entity.entity_id.includes('.')) continue;
    const areaId = entity.area_id || deviceAreas.get(entity.device_id) || null;
    result.set(entity.entity_id, areaId ? areas.get(areaId) || null : null);
  }
  return result;
}

/**
 * Metadata cached for 60s; live entity states are NOT cached.
 * Negative-cache WS errors briefly so existing assistant requests stay usable.
 */
export function createAreaRegistryCache({
  fetchRegistries = fetchHomeAssistantRegistries,
  ttlMs = 60_000, failureTtlMs = 10_000, timeoutMs = 3000,
  now = () => Date.now(), onError = () => {},
} = {}) {
  let cached = null;
  let inFlight = null;
  let identity = null;
  return {
    async get({ baseUrl, token }) {
      if (!baseUrl || !token) return null;
      const key = baseUrl + '\0' + token.length + '\0' + token.slice(-4);
      if (identity !== key) { identity = key; cached = null; inFlight = null; }
      if (cached && cached.expiresAt > now()) return cached.value;
      if (inFlight) return inFlight;
      const currentKey = key;
      const request = (async () => {
        try {
          const map = areaNamesByEntity(await fetchRegistries({ baseUrl, token, timeoutMs }));
          if (identity === currentKey) cached = { value: map, expiresAt: now() + ttlMs };
          return map;
        } catch (err) {
          onError(err);
          if (identity === currentKey) cached = { value: null, expiresAt: now() + failureTtlMs };
          return null;
        }
      })();
      inFlight = request;
      try { return await request; }
      finally { if (identity === currentKey && inFlight === request) inFlight = null; }
    },
  };
}
