import test from 'node:test';
import assert from 'node:assert/strict';
import * as Blockly from 'blockly';
import yaml from 'js-yaml';
import { yamlTextToInternalJson } from '../src/import/yaml_import.js';
import { renderAutomationToWorkspace } from '../src/import/yamlToBlocks.js';
import { generateScopedYaml } from '../src/utils/automation_yaml_scope.js';
import { setStudyRuntimeEntities } from '../src/data/entities_index.js';
import '../src/blocks/extensions.js';
import { ruleBlocks } from '../src/blocks/rule_blocks.js';
import { ruleMetadataBlocks } from '../src/blocks/rule_metadata.js';
import { rawLinesBlocks } from '../src/blocks/raw_lines.js';
import { haEventStateBlocks } from '../src/blocks/event/event_HA_state.js';
import { eventEntityBlocks } from '../src/blocks/event/event_entity.js';
import { eventGroupBlocks } from '../src/blocks/event/event_group.js';
import { eventNumericSensorBlocks } from '../src/blocks/event/event_sensor_state.js';
import { eventTimeStateBlocks } from '../src/blocks/event/event_time_state.js';
import { eventTemplateBlocks } from '../src/blocks/event/event_template.js';
import { eventForBlocks } from '../src/blocks/event/event_for.js';
import { haEventSunBlocks } from '../src/blocks/event/event_sun.js';
import { eventSunStateBlocks } from '../src/blocks/event/event_sun_state.js';
import { eventEventBlocks } from '../src/blocks/event/event_event.js';
import { eventMqttBlocks } from '../src/blocks/event/event_mqtt.js';
import { conditionLogicBlocks } from '../src/blocks/condition/condition_logic.js';
import { conditionStateBlocks } from '../src/blocks/condition/condition_entity_state.js';
import { conditionSunBlocks } from '../src/blocks/condition/condition_sun.js';
import { conditionZoneBlocks } from '../src/blocks/condition/condition_zone.js';
import { conditionTimeBlocks } from '../src/blocks/condition/condition_time.js';
import { conditionTemplateBlocks } from '../src/blocks/condition/condition_template.js';
import { conditionNumericStateEntityBlocks } from '../src/blocks/condition/condition_numeric_state_entity.js';
import { conditionNumericStateAttributeBlocks } from '../src/blocks/condition/condition_numeric_state_attribute.js';
import { actionEntityBlocks } from '../src/blocks/action/action_entity.js';
import { actionEcobeeBlocks } from '../src/blocks/action/action_ecobee.js';
import { actionDelayBlocks } from '../src/blocks/action/action_delay.js';
import { actionIfBlocks } from '../src/blocks/action/action_if.js';
import { actionNotifyBlocks } from '../src/blocks/action/action_notify.js';
import { actionGroupBlocks } from '../src/blocks/action/action.group.js';
import { actionJoinBlocks } from '../src/blocks/action/action_join.js';
import { actionScriptBlocks } from '../src/blocks/action/action_script.js';
import { actionNotifyTagBlocks } from '../src/blocks/action/action_notify_tag.js';
import { actionDataBlocks } from '../src/blocks/action/action_data.js';
import { actionMqttBlocks } from '../src/blocks/action/action_mqtt.js';

for(const blocks of [ruleBlocks,ruleMetadataBlocks,rawLinesBlocks,haEventStateBlocks,eventEntityBlocks,eventGroupBlocks,eventNumericSensorBlocks,eventTimeStateBlocks,eventTemplateBlocks,eventForBlocks,haEventSunBlocks,eventSunStateBlocks,eventEventBlocks,eventMqttBlocks,conditionLogicBlocks,conditionStateBlocks,conditionSunBlocks,conditionZoneBlocks,conditionTimeBlocks,conditionTemplateBlocks,conditionNumericStateEntityBlocks,conditionNumericStateAttributeBlocks,actionEntityBlocks,actionEcobeeBlocks,actionDataBlocks,actionDelayBlocks,actionIfBlocks,actionNotifyBlocks,actionGroupBlocks,actionJoinBlocks,actionScriptBlocks,actionNotifyTagBlocks,actionMqttBlocks]) Blockly.common.defineBlocks(blocks);

setStudyRuntimeEntities([
  {entity_id:'binary_sensor.living_motion',state:'off',attributes:{device_class:'motion',friendly_name:'Living Room Motion'}},
  {entity_id:'binary_sensor.bedroom_motion',state:'off',attributes:{device_class:'motion',friendly_name:'Bedroom Motion'}},
  {entity_id:'sensor.living_room_humidity',state:'77',attributes:{device_class:'humidity',friendly_name:'Living Room Humidity',unit_of_measurement:'%'}},
  {entity_id:'person.test_user',state:'home',attributes:{friendly_name:'Test User'}},
  {entity_id:'zone.home',state:'1',attributes:{friendly_name:'Home'}},
  {entity_id:'light.living_room',state:'off',attributes:{friendly_name:'Living Room Light'}},
  {entity_id:'light.entrance',state:'off',attributes:{friendly_name:'Entrance Light'}},
  {entity_id:'cover.bedroom_curtain',state:'closed',attributes:{friendly_name:'Bedroom Curtain'}},
  {entity_id:'switch.dehumidifier',state:'off',attributes:{friendly_name:'Dehumidifier'}},
]);

function headlessWorkspace() {
  const workspace=new Blockly.Workspace();
  const original=workspace.newBlock.bind(workspace);
  workspace.newBlock=(...args)=>{
    const b=original(...args);
    b.initSvg=()=>{};
    b.render=()=>{};
    b.moveBy=()=>{};
    return b;
  };
  return workspace;
}
function yamlRoundTrip(text) {
  const source=yaml.load(text);
  const ws1=headlessWorkspace();
  const ws2=headlessWorkspace();
  try {
    renderAutomationToWorkspace(ws1,yamlTextToInternalJson(text));
    const first=generateScopedYaml(ws1);
    assert.ok(first.includes('triggers:'), 'Trigger section missing');
    assert.ok(first.includes('actions:'), 'Action section missing');
    const parsedFirst=yaml.load(first);
    assert.ok(Array.isArray(parsedFirst)&&parsedFirst.length===1,'Generated YAML must contain one automation');
    renderAutomationToWorkspace(ws2,yamlTextToInternalJson(first));
    const second=generateScopedYaml(ws2);
    assert.deepEqual(yaml.load(second),parsedFirst,'Import/export must reach a stable semantic round-trip');
    return {source:source[0],output:parsedFirst[0],first,second,blocks:ws1.getAllBlocks(false).map(b=>b.type)};
  } finally {
    ws1.dispose();
    ws2.dispose();
  }
}

const cases=[
  {
    name:'motion trigger and light action',
    yaml:`- alias: 'Motion to Light'
  triggers:
    - trigger: state
      entity_id: binary_sensor.living_motion
      to: 'on'
  actions:
    - action: light.turn_on
      target:
        entity_id: light.living_room
`,
    validate(out) {
      assert.equal(out.output.triggers[0].entity_id,'binary_sensor.living_motion');
      assert.equal(out.output.triggers[0].to,'on');
      assert.equal(out.output.actions[0].action,'light.turn_on');
      assert.equal(out.output.actions[0].target.entity_id,'light.living_room');
    },
  },
  {
    name:'motion trigger, home condition, switch action',
    yaml:`- alias: 'Motion Home Dehumidifier'
  triggers:
    - trigger: state
      entity_id: binary_sensor.bedroom_motion
      to: 'on'
  conditions:
    - condition: state
      entity_id: person.test_user
      state: home
  actions:
    - action: switch.turn_on
      target:
        entity_id: switch.dehumidifier
`,
    validate(out) {
      assert.equal(out.output.triggers[0].entity_id,'binary_sensor.bedroom_motion');
      assert.equal(out.output.conditions[0].entity_id,'person.test_user');
      assert.equal(out.output.conditions[0].state,'home');
      assert.equal(out.output.actions[0].action,'switch.turn_on');
    },
  },
  {
    name:'numeric humidity trigger to dehumidifier',
    yaml:`- alias: 'Humidity above 75'
  triggers:
    - trigger: numeric_state
      entity_id: sensor.living_room_humidity
      above: 75
  actions:
    - action: switch.turn_on
      target:
        entity_id: switch.dehumidifier
`,
    validate(out) {
      assert.equal(out.output.triggers[0].trigger,'numeric_state');
      assert.equal(Number(out.output.triggers[0].above),75);
      assert.equal(out.output.actions[0].action,'switch.turn_on');
    },
  }
];

for(const fixture of cases) test('YAML → Blockly → YAML semantic round-trip: '+fixture.name,()=>{
  const result=yamlRoundTrip(fixture.yaml);
  fixture.validate(result);
});
