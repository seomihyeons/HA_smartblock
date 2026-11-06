// Presentation-only Home Assistant state cache. Neither live events nor
// snapshots ever modify Blockly field values or automation serialization.
export function createEntityStateStore({
  initialEntities = [],
  fetchImpl = globalThis.fetch,
  eventSourceFactory = typeof EventSource === 'function' ? (url) => new EventSource(url) : null,
  intervalMs = 5000,
} = {}) {
  let values = new Map(initialEntities.filter((e) => e?.entity_id).map((e) => [e.entity_id, e]));
  let available = true;
  let stopped = false;
  let started = false;
  let running = false;
  let refreshPending = false;
  let live = false;
  let timer = null;
  let source = null;
  let revision = 0;
  const revisions = new Map();
  const listeners = new Set();

  const signature = (entity) => entity && JSON.stringify([
    entity.state, entity.attributes?.device_class, entity.attributes?.friendly_name,
  ]);
  const notify = (ids) => {
    if (ids.size) for (const listener of listeners) listener(ids);
  };
  const invalidate = () => {
    if (!available) return;
    available = false;
    notify(new Set(values.keys()));
  };

  function replace(entities, snapshotRevision = null) {
    const next = new Map((entities || []).filter((e) => e?.entity_id).map((e) => [e.entity_id, e]));
    // An event arriving during an HTTP snapshot must win over the older HTTP
    // response, including when the event removed the entity.
    if (snapshotRevision !== null) {
      for (const [id, changedRevision] of revisions) {
        if (changedRevision <= snapshotRevision) continue;
        if (values.has(id)) next.set(id, values.get(id));
        else next.delete(id);
      }
    }
    const changed = new Set();
    for (const [id, entity] of next) {
      if (signature(values.get(id)) !== signature(entity)) changed.add(id);
    }
    for (const id of values.keys()) if (!next.has(id)) changed.add(id);
    values = next;
    if (!available) for (const id of values.keys()) changed.add(id);
    available = true;
    notify(changed);
  }

  function applyState({ entity_id: id, entity } = {}) {
    if (typeof id !== 'string' || !id.includes('.')) return;
    if (entity !== null && (!entity || entity.entity_id !== id)) return;
    const previous = values.get(id);
    if (entity === null) values.delete(id);
    else values.set(id, entity);
    revisions.set(id, ++revision);
    const changed = new Set();
    if (!available) for (const key of values.keys()) changed.add(key);
    available = true;
    if (signature(previous) !== signature(entity)) changed.add(id);
    notify(changed);
  }

  async function refresh() {
    if (stopped || typeof fetchImpl !== 'function') return;
    if (running) {
      refreshPending = true;
      return;
    }
    running = true;
    const atStart = revision;
    try {
      const response = await fetchImpl('/ha/api/states', { cache: 'no-store' });
      if (!response?.ok) throw new Error('Home Assistant state refresh failed');
      const payload = await response.json();
      const entities = Array.isArray(payload) ? payload : payload.entities;
      if (!Array.isArray(entities)) throw new Error('Invalid HA entities response');
      if (!stopped) replace(entities, atStart);
    } catch (error) {
      // When the stream is healthy, an intermittent REST failure must not
      // replace fresh event data with an unknown state.
      if (!live) invalidate();
      console.warn('[HA-SmartBlock Icons] Entity snapshot unavailable:', error);
    } finally {
      running = false;
      if (refreshPending && !stopped) {
        refreshPending = false;
        void refresh();
      }
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible') void refresh();
  };
  function setLive(connected) {
    if (live === connected) return;
    live = connected;
    if (!connected) {
      invalidate();
      void refresh();
    }
  }

  function start() {
    if (started || stopped || typeof window === 'undefined') return;
    started = true;
    if (eventSourceFactory) {
      try {
        source = eventSourceFactory('/api/entity-state-stream');
        source.addEventListener('status', (event) => {
          try { setLive(JSON.parse(event.data).connected === true); } catch { setLive(false); }
        });
        source.addEventListener('state', (event) => {
          try { applyState(JSON.parse(event.data)); } catch { /* Invalid event ignored */ }
        });
        source.addEventListener('sync', () => { void refresh(); });
        source.onerror = () => setLive(false);
      } catch (error) {
        console.warn('[HA-SmartBlock Icons] Event stream could not start:', error);
        source = null;
      }
    }
    // REST polling is a fallback while the event stream is unavailable.
    timer = setInterval(() => {
      if (!live && document.visibilityState === 'visible') void refresh();
    }, intervalMs);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', stop, { once: true });
    if (!source) void refresh();
  }

  function stop() {
    stopped = true;
    source?.close?.();
    source = null;
    if (timer !== null) clearInterval(timer);
    timer = null;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', stop);
    listeners.clear();
  }

  return {
    get: (id) => available ? values.get(id) || null : null,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    replace, applyState, refresh, start, stop,
  };
}
