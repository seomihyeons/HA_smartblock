// Isolated runtime state cache; this module never mutates Blockly or the
// entity dropdown option arrays. No credentials are exposed to the browser.
export function createEntityStateStore({initialEntities=[],fetchImpl=globalThis.fetch,intervalMs=5000}={}) {
  let values=new Map((initialEntities||[]).filter(e=>e?.entity_id).map(e=>[e.entity_id,e]));
  let available=true;
  let stopped=false;
  let running=false;
  let timer=null;
  const listeners=new Set();
  function notify(changedIds) {
    if (changedIds.size) listeners.forEach(listener=>listener(changedIds));
  }
  function signature(item) {
    return item && JSON.stringify([item.state,item.attributes?.device_class,item.attributes?.friendly_name]);
  }
  function replace(entities) {
    const next=new Map((entities||[]).filter(e=>e?.entity_id).map(e=>[e.entity_id,e]));
    const changed=new Set();
    for(const [id,row] of next) if(signature(values.get(id))!==signature(row)) changed.add(id);
    for(const id of values.keys()) if(!next.has(id)) changed.add(id);
    values=next;
    const previouslyAvailable=available;
    available=true;
    if(!previouslyAvailable) for(const id of values.keys()) changed.add(id);
    notify(changed);
  }
  async function refresh() {
    if(running || stopped || typeof fetchImpl!=='function') return;
    running=true;
    try {
      const response=await fetchImpl('/api/entities',{cache:'no-store'});
      if(!response?.ok) throw new Error('Home Assistant state refresh failed');
      const payload=await response.json();
      if(!Array.isArray(payload.entities)) throw new Error('Invalid HA entities response');
      replace(payload.entities);
    } catch(error) {
      if(available) {
        available=false;
        notify(new Set(values.keys()));
      }
      console.warn('[HA-SmartBlock Icons] Entity states unavailable:',error);
    } finally { running=false; }
  }
  function onVisibility() {
    if(typeof document!=='undefined' && document.visibilityState==='visible') void refresh();
  }
  function stop() {
    stopped=true;
    if(timer!==null) clearInterval(timer);
    if(typeof document!=='undefined') document.removeEventListener('visibilitychange',onVisibility);
    if(typeof window!=='undefined') window.removeEventListener('pagehide',stop);
    listeners.clear();
  }
  function start() {
    if(stopped || timer!==null || typeof window==='undefined') return;
    timer=setInterval(()=>{
      if(typeof document==='undefined' || document.visibilityState==='visible') void refresh();
    },intervalMs);
    document.addEventListener('visibilitychange',onVisibility);
    window.addEventListener('pagehide',stop,{once:true});
  }
  return {
    get: id=>available ? values.get(id)||null : null,
    subscribe(listener) {listeners.add(listener);return ()=>listeners.delete(listener);},
    replace, refresh, start, stop,
  };
}
