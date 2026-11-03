import test from 'node:test';
import assert from 'node:assert/strict';
import { MDI_PATHS } from '../src/icons/mdi_registry.js';
import { DOMAIN_ICONS, STATE_ICON_PAIRS, resolveConfiguredIcon, resolveActualIcon, resolveSunDropdownIcon, FILLED_ICON_COLOR } from '../src/icons/icon_semantics.js';

const block=(type,fields)=>({type,getFieldValue(name){return fields[name] ?? '';}});

test('Every referenced MDI icon resolves to a real @mdi/js SVG path',()=>{
  const referenced=new Set(Object.values(DOMAIN_ICONS));
  for (const pairMap of Object.values(STATE_ICON_PAIRS)) for (const pair of Object.values(pairMap)) pair.forEach(icon=>referenced.add(icon));
  for (const name of referenced) assert.ok(typeof MDI_PATHS[name]==='string' && MDI_PATHS[name].startsWith('M'),name);
  assert.equal(Object.keys(DOMAIN_ICONS).length,40);
});

test('Filled Light icon changes with configured TO, not actual state',()=>{
  const b=block('event_light_state',{TO:'on',ENTITY_ID:'light.living_room'});
  assert.equal(resolveConfiguredIcon(b,{entity_id:'light.living_room',state:'off'}).name,'lightbulb');
  assert.equal(resolveConfiguredIcon(block('action_light',{ACTION:'turn_off'})).name,'lightbulb-off');
});

test('Motion and Door retain binary_sensor on/off storage but use specialized icons',()=>{
  assert.equal(resolveConfiguredIcon(block('condition_state_binary_sensor_motion',{STATE:'on'})).name,'motion-sensor');
  assert.equal(resolveConfiguredIcon(block('event_binary_sensor_door_state',{TO:'off'})).name,'door-closed');
  assert.equal(resolveConfiguredIcon(block('event_binary_sensor_state',{TO:'on'})).name,'radiobox-marked');
});

test('Actual icon only reflects current Home Assistant state',()=>{
  const id='light.living_room';
  assert.equal(resolveActualIcon(id,{entity_id:id,domain:'light',state:'off'}).name,'lightbulb-off-outline');
  assert.equal(resolveActualIcon(id,{entity_id:id,domain:'light',state:'on'}).name,'lightbulb-outline');
  assert.equal(resolveActualIcon(id,null).unknown,true);
});

test('Switches all use specified toggle-switch-variant icons, including dehumidifier',()=>{
  for (const id of ['switch.dehumidifier','switch.living_room','switch.generic']) {
    assert.equal(resolveConfiguredIcon(block('action_switch',{ACTION:'turn_on',ENTITY_ID:id})).name,'toggle-switch-variant');
    assert.equal(resolveConfiguredIcon(block('action_switch',{ACTION:'turn_off',ENTITY_ID:id})).name,'toggle-switch-variant-off');
    assert.equal(resolveActualIcon(id,{entity_id:id,domain:'switch',state:'on'}).name,'toggle-switch-variant');
    assert.equal(resolveActualIcon(id,{entity_id:id,domain:'switch',state:'off'}).name,'toggle-switch-variant-off');
  }
});

test('No speculative state icon for toggles, any, or arbitrary actions',()=>{
  assert.equal(resolveConfiguredIcon(block('action_switch',{ACTION:'toggle'})).name,'toggle-switch-variant');
  assert.equal(resolveConfiguredIcon(block('event_light_state',{TO:''})).name,'lightbulb');
  assert.equal(resolveConfiguredIcon(block('action_media_player',{ACTION:'volume_set'})).name,'play-circle');
});

test('Rule containers are not decorated',()=>{
  assert.equal(resolveConfiguredIcon(block('event_action',{})),null);
  assert.equal(resolveConfiguredIcon(block('event_condition_action',{})),null);
});

test('Every leading icon uses true black regardless of configured state',()=>{
  for(const [type,fields] of [
    ['action_light',{ACTION:'turn_on'}],['action_light',{ACTION:'turn_off'}],
    ['action_switch',{ACTION:'turn_on'}],['action_switch',{ACTION:'turn_off'}],
    ['event_binary_sensor_motion_state',{TO:'on'}],
    ['event_binary_sensor_door_state',{TO:'off'}],
    ['event_cover_state',{TO:'open'}],
    ['condition_state_person',{STATE:'home'}],
    ['action_notify',{}],
  ]) assert.equal(resolveConfiguredIcon(block(type,fields))?.color,FILLED_ICON_COLOR,type);
  assert.equal(FILLED_ICON_COLOR,'#000000');
});

test('Specified Light and Switch MDI names are retained for filled and actual icons',()=>{
  assert.deepEqual(STATE_ICON_PAIRS.light.on,['lightbulb','lightbulb-outline']);
  assert.deepEqual(STATE_ICON_PAIRS.light.off,['lightbulb-off','lightbulb-off-outline']);
  assert.deepEqual(STATE_ICON_PAIRS.switch.on,['toggle-switch-variant','toggle-switch-variant']);
  assert.deepEqual(STATE_ICON_PAIRS.switch.off,['toggle-switch-variant-off','toggle-switch-variant-off']);
});

test('Structural, group, duration and offset blocks do not show leading icons',()=>{
  for (const type of [
    'event_action','event_condition_action','ha_event_for_hms','ha_event_offset',
    'condition_sun_offset','condition_not_value','condition_logic','condition_not_inline',
    'event_group_entities','event_group_numeric_entities','action_if_then',
    'action_if_else','action_group_entities','action_join',
  ]) assert.equal(resolveConfiguredIcon(block(type,{})),null,type);
  const outputOnly={...block('custom_duration_helper',{}),outputConnection:{},previousConnection:null,nextConnection:null};
  assert.equal(resolveConfiguredIcon(outputOnly),null);
});

test('Sun and Time conditions resolve to meaningful time and sun icons',()=>{
  for (const [type,expected] of [
    ['condition_sun','weather-sunny'],
    ['condition_sun_phase','weather-night'],
    ['condition_sun_after','weather-sunset'],
    ['condition_sun_before','weather-sunset'],
    ['condition_time','clock'],
    ['condition_time_weekly','calendar-week'],
    ['ha_event_time_state','clock'],
    ['ha_event_time_pattern','clock'],
  ]) {
    const actual=resolveConfiguredIcon(block(type,{}));
    assert.equal(actual?.name,expected,type);
    assert.ok(typeof MDI_PATHS[actual.name]==='string' && MDI_PATHS[actual.name].startsWith('M'),type);
  }
});

test('sunrise/sunset and night/midnight sun use distinct MDI icon meanings',()=>{
  const examples=[
    ['ha_event_sun','EVENT','sunrise','weather-sunset-up'],
    ['ha_event_sun','EVENT','sunset','weather-sunset-down'],
    ['condition_sun_before','EVENT','sunset','weather-sunset-down'],
    ['condition_sun_after','EVENT','sunrise','weather-sunset-up'],
    ['ha_event_sun_state','TO','above_horizon','weather-sunny'],
    ['ha_event_sun_state','TO','below_horizon','weather-night'],
    ['ha_event_sun_state','FROM','below_horizon','weather-night'],
    ['condition_sun_phase','PHASE','sun.is_night','weather-night'],
    ['condition_sun_phase','PHASE','sun.is_polar_night','weather-night'],
    ['condition_sun_phase','PHASE','sun.is_midnight_sun','weather-sunny'],
  ];
  for(const [type,field,value,icon] of examples) {
    const resolved=resolveSunDropdownIcon(type,field,value);
    assert.equal(resolved?.name,icon,type+' '+field+' '+value);
    assert.equal(resolved?.color,'#000000');
    assert.ok(typeof MDI_PATHS[icon]==='string' && MDI_PATHS[icon].startsWith('M'),icon);
  }
  assert.equal(resolveSunDropdownIcon('action_light','EVENT','sunrise'),null);
});

test('Sun block leading icons follow their own configured field values',()=>{
  assert.equal(resolveConfiguredIcon(block('ha_event_sun',{EVENT:'sunrise'})).name,'weather-sunset-up');
  assert.equal(resolveConfiguredIcon(block('ha_event_sun',{EVENT:'sunset'})).name,'weather-sunset-down');
  assert.equal(resolveConfiguredIcon(block('condition_sun_before',{EVENT:'sunset'})).name,'weather-sunset-down');
  assert.equal(resolveConfiguredIcon(block('ha_event_sun_state',{TO:'below_horizon'})).name,'weather-night');
  assert.equal(resolveConfiguredIcon(block('condition_sun_phase',{PHASE:'sun.is_midnight_sun'})).name,'weather-sunny');
});

test('Generic events and payload helpers avoid speculative lightning glyphs',()=>{
  for(const [type,expected] of [
    ['ha_event_event','tag'],
    ['ha_event_kv','code-braces'],
    ['ha_event_event_data_call_service','gesture-tap-button'],
    ['ha_event_context_kv','code-braces'],
    ['ha_event_mqtt_payload','message-text'],
    ['action_mqtt_publish','access-point-network'],
  ]) assert.equal(resolveConfiguredIcon(block(type,{}))?.name,expected,type);
});

test('Actual-state dropdowns use black icons for known and unknown entities',()=>{
  for(const entity of [
    null,
    {entity_id:'sun.sun',domain:'sun',state:'below_horizon'},
    {entity_id:'light.living_room',domain:'light',state:'on'},
  ]) {
    const id=entity?.entity_id || 'light.missing';
    assert.equal(resolveActualIcon(id,entity).color,'#000000');
  }
});
