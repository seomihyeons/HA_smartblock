import test from 'node:test';
import assert from 'node:assert/strict';
import { MDI_PATHS } from '../src/icons/mdi_registry.js';
import { DOMAIN_ICONS, STATE_ICON_PAIRS, resolveConfiguredIcon, resolveActualIcon } from '../src/icons/icon_semantics.js';

const block=(type,fields)=>({type,getFieldValue(name){return fields[name] ?? '';}});

test('Every referenced MDI icon resolves to a real @mdi/js SVG path',()=>{
  const referenced=new Set(Object.values(DOMAIN_ICONS));
  for (const pairMap of Object.values(STATE_ICON_PAIRS)) for (const pair of Object.values(pairMap)) pair.forEach(icon=>referenced.add(icon));
  for (const name of referenced) assert.ok(typeof MDI_PATHS[name]==='string' && MDI_PATHS[name].startsWith('M'),name);
  assert.equal(Object.keys(DOMAIN_ICONS).length,40);
});

test('Filled Light icon changes with configured TO, not actual state',()=>{
  const b=block('event_light_state',{TO:'on',ENTITY_ID:'light.living_room'});
  assert.equal(resolveConfiguredIcon(b,{entity_id:'light.living_room',state:'off'}).name,'lightbulb-on');
  assert.equal(resolveConfiguredIcon(block('action_light',{ACTION:'turn_off'})).name,'lightbulb-off');
});

test('Motion and Door retain binary_sensor on/off storage but use specialized icons',()=>{
  assert.equal(resolveConfiguredIcon(block('condition_state_binary_sensor_motion',{STATE:'on'})).name,'motion-sensor');
  assert.equal(resolveConfiguredIcon(block('event_binary_sensor_door_state',{TO:'off'})).name,'door-closed');
  assert.equal(resolveConfiguredIcon(block('event_binary_sensor_state',{TO:'on'})).name,'radiobox-marked');
});

test('Actual icon only reflects current Home Assistant state',()=>{
  const id='light.living_room';
  assert.equal(resolveActualIcon(id,{entity_id:id,domain:'light',state:'off'}).name,'lightbulb-outline');
  assert.equal(resolveActualIcon(id,{entity_id:id,domain:'light',state:'on'}).name,'lightbulb-on-outline');
  assert.equal(resolveActualIcon(id,null).unknown,true);
});

test('Dehumidifier service has special icon despite switch entity domain',()=>{
  const b=block('action_switch',{ACTION:'turn_on',ENTITY_ID:'switch.dehumidifier'});
  assert.equal(resolveConfiguredIcon(b,{entity_id:'switch.dehumidifier',state:'off'}).name,'water-minus');
  assert.equal(resolveActualIcon('switch.dehumidifier',{entity_id:'switch.dehumidifier',domain:'switch',state:'off'}).name,'water-outline');
});

test('No speculative state icon for toggles, any, or arbitrary actions',()=>{
  assert.equal(resolveConfiguredIcon(block('action_switch',{ACTION:'toggle'})).name,'toggle-switch');
  assert.equal(resolveConfiguredIcon(block('event_light_state',{TO:''})).name,'lightbulb');
  assert.equal(resolveConfiguredIcon(block('action_media_player',{ACTION:'volume_set'})).name,'play-circle');
});

test('Rule containers are not decorated',()=>{
  assert.equal(resolveConfiguredIcon(block('event_action',{})),null);
  assert.equal(resolveConfiguredIcon(block('event_condition_action',{})),null);
});
