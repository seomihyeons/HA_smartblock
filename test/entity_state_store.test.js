import test from 'node:test';
import assert from 'node:assert/strict';
import { createEntityStateStore } from '../src/icons/entity_state_store.js';

const entity=(state)=>({entity_id:'light.bedroom',state,attributes:{device_class:'light'}});

test('state store tracks changed states without touching Blockly',()=>{
  const store=createEntityStateStore({initialEntities:[entity('off')]});
  const notices=[];
  store.subscribe(ids=>notices.push([...ids]));
  assert.equal(store.get('light.bedroom').state,'off');
  store.replace([entity('off')]);
  assert.equal(notices.length,0);
  store.replace([entity('on')]);
  assert.equal(store.get('light.bedroom').state,'on');
  assert.deepEqual(notices,[['light.bedroom']]);
  store.stop();
});

test('state store degrades to unknown on API failure, recovers on success',async()=>{
  let fail=true;
  const store=createEntityStateStore({initialEntities:[entity('off')],fetchImpl:async()=>{
    if(fail) throw Error('offline');
    return {ok:true,json:async()=>({entities:[entity('on')]})};
  }});
  const changed=[];
  store.subscribe(ids=>changed.push([...ids]));
  const warn=console.warn;
  console.warn=()=>{};
  try {await store.refresh();} finally {console.warn=warn;}
  assert.equal(store.get('light.bedroom'),null);
  fail=false;
  await store.refresh();
  assert.equal(store.get('light.bedroom').state,'on');
  assert.deepEqual(changed,[['light.bedroom'],['light.bedroom']]);
  store.stop();
});

test('an individual HA event changes only its entity and supports removal',()=>{
  const light={entity_id:'light.bedroom',state:'on',attributes:{}};
  const door={entity_id:'binary_sensor.door',state:'off',attributes:{device_class:'door'}};
  const store=createEntityStateStore({initialEntities:[entity('off'),door]});
  const changed=[];
  store.subscribe(ids=>changed.push([...ids]));
  store.applyState({entity_id:'light.bedroom',entity:light});
  assert.equal(store.get('light.bedroom').state,'on');
  assert.equal(store.get('binary_sensor.door').state,'off');
  store.applyState({entity_id:'binary_sensor.door',entity:null});
  assert.equal(store.get('binary_sensor.door'),null);
  assert.deepEqual(changed,[['light.bedroom'],['binary_sensor.door']]);
  store.stop();
});

test('late REST snapshots do not overwrite events received during fetch',async()=>{
  let complete;
  const store=createEntityStateStore({
    initialEntities:[entity('off')],
    fetchImpl:()=>new Promise(resolve=>{complete=resolve;}),
  });
  const pending=store.refresh();
  store.applyState({entity_id:'light.bedroom',entity:entity('on')});
  complete({ok:true,json:async()=>({entities:[entity('off')]})});
  await pending;
  assert.equal(store.get('light.bedroom').state,'on');
  store.stop();
});

test('state stream subscriptions update state without changing entity selections',()=>{
  // The store does not import Blockly, and its notifications are entity IDs.
  const store=createEntityStateStore({initialEntities:[entity('off')]});
  const notices=[];
  store.subscribe(changed=>notices.push([...changed]));
  store.applyState({entity_id:'light.bedroom',entity:entity('on')});
  assert.deepEqual(notices,[['light.bedroom']]);
  store.stop();
});
