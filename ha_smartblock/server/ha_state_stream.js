'use strict';

const WebSocket = require('ws');

/**
 * One server-side Home Assistant state_changed subscription is shared across
 * browser clients. Home Assistant credentials never reach the browser.
 * Browsers consume same-origin Server-Sent Events (SSE) only.
 */
function createHaStateStream({
  getUrl,
  getToken,
  normalizeEntity,
  WebSocketImpl = WebSocket,
  retryMinMs = 1000,
  retryMaxMs = 30000,
  heartbeatMs = 25000,
} = {}) {
  const clients = new Set();
  let socket = null;
  let retryTimer = null;
  let heartbeat = null;
  let attempts = 0;
  let subscribed = false;
  let stopped = false;

  const send = (response, name, data) => {
    if (response.destroyed || response.writableEnded) return;
    try {
      response.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      clients.delete(response);
    }
  };
  const broadcast = (name, data) => {
    for (const response of clients) send(response, name, data);
  };
  const status = (connected) => broadcast('status', { connected });

  const scheduleRetry = () => {
    if (stopped || !clients.size || retryTimer) return;
    const delay = Math.min(retryMaxMs, retryMinMs * 2 ** Math.min(attempts++, 6));
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connectHa();
    }, delay);
    retryTimer.unref?.();
  };

  function connectHa() {
    if (stopped || !clients.size || socket) return;
    const token = getToken?.();
    if (!token) {
      status(false);
      scheduleRetry();
      return;
    }

    let ws;
    try {
      ws = new WebSocketImpl(getUrl(), {
        handshakeTimeout: 15000,
        perMessageDeflate: false,
      });
    } catch (error) {
      console.warn('[HA-SmartBlock] HA state stream connection failed:', error.message);
      status(false);
      scheduleRetry();
      return;
    }
    socket = ws;

    ws.on('message', (message) => {
      let payload;
      try { payload = JSON.parse(String(message)); } catch { return; }
      if (payload.type === 'auth_required') {
        ws.send(JSON.stringify({ type: 'auth', access_token: token }));
      } else if (payload.type === 'auth_ok') {
        ws.send(JSON.stringify({
          id: 1,
          type: 'subscribe_events',
          event_type: 'state_changed',
        }));
      } else if (payload.type === 'auth_invalid') {
        console.warn('[HA-SmartBlock] Home Assistant WebSocket authentication rejected');
        ws.close();
      } else if (payload.type === 'result' && payload.id === 1) {
        if (!payload.success) {
          console.warn('[HA-SmartBlock] HA state_changed subscription failed');
          ws.close();
          return;
        }
        subscribed = true;
        attempts = 0;
        status(true);
        // Request an authoritative snapshot after initial connect/reconnect,
        // covering state changes which occurred while this stream was absent.
        broadcast('sync', {});
      } else if (subscribed && payload.type === 'event' && payload.id === 1) {
        const data = payload.event?.data;
        const id = data?.entity_id;
        if (typeof id !== 'string' || !id.includes('.')) return;
        const entity = data.new_state ? normalizeEntity(data.new_state) : null;
        if (entity && entity.entity_id !== id) return;
        broadcast('state', { entity_id: id, entity });
      }
    });

    ws.on('error', (error) => {
      console.warn('[HA-SmartBlock] HA state stream error:', error.message);
    });
    ws.on('close', () => {
      if (socket !== ws) return;
      socket = null;
      subscribed = false;
      status(false);
      scheduleRetry();
    });
  }

  const disconnectHa = () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    if (socket) {
      const ws = socket;
      socket = null;
      subscribed = false;
      ws.terminate?.();
    }
  };

  function handle(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    clients.add(res);
    send(res, 'status', { connected: subscribed });
    // Start the shared WebSocket only when a browser needs state updates.
    if (!heartbeat) {
      heartbeat = setInterval(() => {
        for (const response of clients) {
          if (!response.destroyed && !response.writableEnded) response.write(': keepalive\n\n');
        }
      }, heartbeatMs);
      heartbeat.unref?.();
    }
    connectHa();

    const cleanup = () => {
      if (!clients.delete(res)) return;
      if (!clients.size) {
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        disconnectHa();
      }
    };
    req.on('close', cleanup);
    res.on('close', cleanup);
  }

  function stop() {
    stopped = true;
    for (const res of clients) res.end();
    clients.clear();
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    disconnectHa();
  }

  return { handle, stop };
}

module.exports = { createHaStateStream };
