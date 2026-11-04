// Executed by GitHub Actions against the real production webpack bundle.
// Uses a stubbed Home Assistant state endpoint; no HA credentials are required.
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const { chromium }=require('playwright');
const root=path.resolve(__dirname,'../dist');
let actual='off';
const streamClients=new Set();
function changeActual(next) {
  actual=next;
  const payload={entity_id:'light.living_room',entity:{
    entity_id:'light.living_room',state:actual,domain:'light',
    attributes:{friendly_name:'Living Room Light'},
  }};
  for(const res of streamClients) res.write('event: state\\ndata: '+JSON.stringify(payload)+'\\n\\n');
}
const fixture=()=>({source:'homeassistant',entities:[
  {entity_id:'light.living_room',state:actual,domain:'light',attributes:{friendly_name:'Living Room Light'}},
  {entity_id:'binary_sensor.living_motion',state:'off',domain:'binary_sensor',attributes:{friendly_name:'Living Motion',device_class:'motion'}},
  {entity_id:'person.test_user',state:'home',domain:'person',attributes:{friendly_name:'Test User'}},
]});
const server=http.createServer(async(req,res)=>{
  const requestPath=new URL(req.url,'http://localhost').pathname;
  if(requestPath==='/api/entity-state-stream') {
    res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache'});
    res.write('event: status\\ndata: {"connected":true}\\n\\n');
    streamClients.add(res);
    req.on('close',()=>streamClients.delete(res));
    return;
  }
  if(requestPath==='/api/entities') {
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify(fixture())); return;
  }
  const target=path.resolve(root,'.'+(requestPath==='/'?'/index.html':requestPath));
  if(!target.startsWith(root+path.sep)) {res.writeHead(403);res.end();return;}
  try {
    const bytes=await fs.readFile(target);
    res.writeHead(200,{'content-type':target.endsWith('.js')?'application/javascript':target.endsWith('.html')?'text/html':'application/octet-stream'});
    res.end(bytes);
  }catch {res.writeHead(404);res.end();}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try {
    const page=await browser.newPage();
    const errors=[];
    page.on('pageerror',err=>errors.push(err.message));
    await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.ws && window.Blockly,{timeout:15000});
    const initial=await page.evaluate(()=>{
      const ws=window.ws;
      const block=ws.newBlock('action_light');
      block.initSvg(); block.render();
      block.setFieldValue('light.living_room','ENTITY_ID');
      block.setFieldValue('turn_on','ACTION');
      return block.id;
    });
    await page.waitForFunction(id=>{
      const block=window.ws.getBlockById(id);
      return !!(block?.getField('HA_FILLED_ICON') && block?.getField('ENTITY_ID')?.getSvgRoot()?.querySelector('image[data-ha-actual-icon="true"]'));
    },initial,{timeout:8000});
    await page.waitForFunction(id=>{
      const block=window.ws.getBlockById(id);
      const image=block?.getField('HA_FILLED_ICON')?.getSvgRoot()?.querySelector('image');
      const outline=block?.pathObject?.svgPath || block?.getSvgRoot()?.querySelector('.blocklyPath');
      if(!image || !outline) return false;
      const a=image.getBoundingClientRect(),b=outline.getBoundingClientRect();
      return a.height>0 && b.height>0 && Math.abs((a.top+a.height/2)-(b.top+b.height/2))<=1.5;
    },initial,{timeout:8000});
    // Notify has a statement input below its target row. Its leading icon
    // must stay centred in its own renderer-laid-out field, never be moved
    // toward the centre of the complete multi-row block.
    const notify=await page.evaluate(()=>{
      const block=window.ws.newBlock('action_notify');
      const message=window.ws.newBlock('action_notify_message_text');
      block.initSvg(); message.initSvg();
      message.previousConnection.connect(block.getInput('MESSAGE_BLOCKS').connection);
      block.render(); message.render();
      return block.id;
    });
    const notifyAlignment=await page.evaluate(id=>{
      const block=window.ws.getBlockById(id);
      const field=block?.getField('HA_FILLED_ICON');
      const icon=field?.getSvgRoot()?.querySelector('image');
      const fieldRoot=field?.getSvgRoot?.();
      if(!icon||!fieldRoot)return {missing:true};
      const a=icon.getBoundingClientRect(),b=fieldRoot.getBoundingClientRect();
      return {icon:a.toJSON(),field:b.toJSON(),delta:Math.abs((a.top+a.height/2)-(b.top+b.height/2))};
    },notify);
    assert.ok(!notifyAlignment.missing&&notifyAlignment.delta<=1.5,
      'Notify icon must stay centred in its renderer-owned field: '+JSON.stringify(notifyAlignment));
    const ruleTooltips=await page.evaluate(()=>{
      const block=window.ws.newBlock('event_condition_action');
      block.initSvg(); block.render();
      // Keep the target away from the Toolbox overlay so Playwright hovers the
      // actual SVG label rather than a screen-level toolbox element.
      block.moveBy(420,180);
      return {
        trigger:block.getInput('EVENT').fieldRow[0].getTooltip(),
        condition:block.getInput('CONDITION').fieldRow[0].getTooltip(),
        action:block.getInput('ACTION').fieldRow[0].getTooltip(),
      };
    });
    assert.equal(ruleTooltips.trigger,'','Rule labels must not use Blockly\'s stock tooltip');
    assert.equal(ruleTooltips.condition,'','Rule labels must not use Blockly\'s stock tooltip');
    assert.equal(ruleTooltips.action,'','Rule labels must not use Blockly\'s stock tooltip');
    const triggerLabelBounds=await page.evaluate(()=>{
      const block=window.ws.getTopBlocks(false).find(b=>b.type==='event_condition_action');
      const rect=block.getInput('EVENT').fieldRow[0].getSvgRoot().querySelector('rect');
      const bounds=rect.getBoundingClientRect();
      return {x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height};
    });
    await page.mouse.move(
      triggerLabelBounds.x+triggerLabelBounds.width/2,
      triggerLabelBounds.y+triggerLabelBounds.height/2,
    );
    await page.waitForFunction(
      ()=>document.querySelector('.ha-rule-section-tooltip')?.textContent.includes('When the sun sets'),
      // Rule guidance is a custom popover with a short delay. Keep it well
      // below one second while avoiding flicker during normal block dragging.
      {timeout:1000},
    );
    const conditionLabelBounds=await page.evaluate(()=>{
      const block=window.ws.getTopBlocks(false).find(b=>b.type==='event_condition_action');
      const rect=block.getInput('CONDITION').fieldRow[0].getSvgRoot().querySelector('rect');
      const bounds=rect.getBoundingClientRect();
      return {x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height};
    });
    await page.mouse.move(
      conditionLabelBounds.x+conditionLabelBounds.width/2,
      conditionLabelBounds.y+conditionLabelBounds.height/2,
    );
    await page.waitForFunction(
      ()=>document.querySelector('.ha-rule-section-tooltip')?.textContent.includes('All conditions added here'),
      {timeout:500},
    );
    await page.mouse.click(
      conditionLabelBounds.x+conditionLabelBounds.width/2,
      conditionLabelBounds.y+conditionLabelBounds.height/2,
    );
    await page.mouse.move(1100,700);
    await page.waitForFunction(
      ()=>!document.querySelector('.ha-rule-section-tooltip')?.hidden,
      {timeout:500},
    );
    await page.mouse.click(1100,700);
    await page.waitForFunction(
      ()=>document.querySelector('.ha-rule-section-tooltip')?.hidden,
      {timeout:500},
    );
    const baseline=await page.evaluate(id=>{
      const b=window.ws.getBlockById(id),f=b.getField('ENTITY_ID');
      const img=f.getSvgRoot().querySelector('image[data-ha-actual-icon="true"]');
      const arrow=f.getSvgRoot().querySelector('image:not([data-ha-actual-icon])');
      const bounds=img.getBoundingClientRect();
      const text=f.getTextElement().getBoundingClientRect();
      if(bounds.width<10 || bounds.height<10 || text.left-bounds.right<3 || text.left-bounds.right>16)
        throw Error('Entity icon must be separated by approximately one space: '+JSON.stringify({bounds:bounds.toJSON(),text:text.toJSON()}));
      return {filled:b.getField('HA_FILLED_ICON').getValue(),actual:img.getAttribute('href'),
        arrowBefore:arrow?.getAttribute('href'),saved:JSON.stringify(window.Blockly.serialization.workspaces.save(window.ws))};
    },initial);
    await page.evaluate(id=>{
      const block=window.ws.getBlockById(id);
      const source=decodeURIComponent(block.getField('HA_FILLED_ICON').getValue().split(',')[1]);
      if (!source.includes('fill="#000000"')) throw Error('Filled icon must use black palette');
    },initial);
    changeActual('on');
    await page.waitForFunction(({id,before})=>{
      const img=window.ws.getBlockById(id)?.getField('ENTITY_ID')?.getSvgRoot()?.querySelector('image[data-ha-actual-icon="true"]');
      return !!img && img.getAttribute('href')!==before;
    },{id:initial,before:baseline.actual},{timeout:13000});
    const updated=await page.evaluate(id=>{
      const b=window.ws.getBlockById(id);
      const f=b.getField('ENTITY_ID');
      const arrow=f.getSvgRoot().querySelector('image:not([data-ha-actual-icon])');
      return {filled:b.getField('HA_FILLED_ICON').getValue(),
        arrowAfter:arrow?.getAttribute('href'),saved:JSON.stringify(window.Blockly.serialization.workspaces.save(window.ws))};
    },initial);
    assert.equal(updated.filled,baseline.filled,'Live HA state must not change configured filled icon');
    assert.equal(updated.saved,baseline.saved,'Live HA refresh must not change serializable workspace');
    assert.equal(updated.arrowAfter,baseline.arrowBefore,'HA refresh must not replace Blockly dropdown arrow');
    await page.evaluate(id=>window.ws.getBlockById(id).setFieldValue('turn_off','ACTION'),initial);
    await page.waitForFunction(({id,old})=>window.ws.getBlockById(id)?.getField('HA_FILLED_ICON')?.getValue()!==old,
      {id:initial,old:baseline.filled},{timeout:5000});
    await page.evaluate(id=>window.ws.getBlockById(id).getField('ENTITY_ID').showEditor_(),initial);
    await page.waitForSelector('.ha-entity-search-input',{timeout:5000});
    // Every entity option contains the same state-specific MDI image as its
    // selected dropdown. While the menu stays open, only the icon changes.
    const listIcon=page.locator('.ha-entity-search-option img[data-ha-entity-id="light.living_room"]');
    await listIcon.waitFor({state:'visible'});
    const listBefore=await listIcon.getAttribute('src');
    await page.locator('.ha-entity-search-input').fill('Living');
    const queryBefore=await page.locator('.ha-entity-search-input').inputValue();
    changeActual('off');
    await page.waitForFunction(before=>{
      const image=document.querySelector('.ha-entity-search-option img[data-ha-entity-id="light.living_room"]');
      return image?.getAttribute('src')!==before;
    },listBefore,{timeout:13000});
    assert.equal(await page.locator('.ha-entity-search-input').inputValue(),queryBefore,
      'State changes must not reset the search query');
    assert.equal(await page.locator('.ha-entity-search-option').count(),1,
      'State changes must not rebuild or expand the filtered options');
    // The option has only a decorative image and its original label, no
    // newly introduced ON/OFF badges or status text.
    assert.equal(await page.locator('.ha-entity-search-option').first().innerText(),'Living Room Light');
    await page.locator('.ha-entity-search-input').fill('');
    // Native Toolbox preview: verify Trigger, Condition and Action before drag.
    const native=await page.evaluate(async()=>{
      const toolbox=window.ws.getToolbox();
      const result={};
      for(const name of ['Trigger','Condition','Action']) {
        const category=toolbox.getToolboxItems().find(x=>x.getName?.()===name);
        if(!category) throw Error('Missing category: '+name);
        // Use the actual Blockly category-selection API so the app's
        // availability styling listener also runs for this category.
        toolbox.setSelectedItem(category);
        // Availability opacity is scheduled on the next frame; inspect only
        // after the class is applied so muted previews are tested as rendered.
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        const blocks=toolbox.getFlyout().getWorkspace().getAllBlocks(false);
        let entityIcons=0,leadingIcons=0,unavailableIcons=0,sunDropdowns=0;
        const failures=[];
        for(const b of blocks) {
          for(const key of ['ENTITY_ID','ENTITY','USER','AFTER_ENTITY','BEFORE_ENTITY']) {
            const field=b.getField(key);
            // Some dynamically optional dropdowns (e.g., Ecobee's
            // USE_ENTITY=false field) are intentionally not rendered.
            if(!field || field.isVisible?.()===false)continue;
            if(field.getSvgRoot()?.querySelector('image[data-ha-actual-icon="true"]'))entityIcons++;
            else failures.push(b.type+': missing '+key+' icon');
          }
          if (['ha_event_sun','ha_event_sun_state','condition_sun_phase',
               'condition_sun_after','condition_sun_before'].includes(b.type)) {
            for(const key of ['EVENT','FROM','TO','PHASE']) {
              const dropdown=b.getField(key);
              if(!dropdown) continue;
              const image=dropdown.getSvgRoot()?.querySelector('image[data-ha-actual-icon="true"]');
              if(!image) failures.push(b.type+': missing Sun '+key+' icon');
              else sunDropdowns++;
            }
          }
          const icon=b.getField('HA_FILLED_ICON')?.getSvgRoot()?.querySelector('image');
          const path=b.pathObject?.svgPath||b.getSvgRoot()?.querySelector('.blocklyPath');
          if(!icon||!path)continue;
          leadingIcons++;
          if(b.getSvgRoot()?.classList.contains('ha-toolbox-unavailable')) unavailableIcons++;
          const a=icon.getBoundingClientRect();
          const iconField=b.getField('HA_FILLED_ICON');
          const c=iconField.getSvgRoot()?.getBoundingClientRect()||path.getBoundingClientRect();
          const delta=Math.abs((a.top+a.height/2)-(c.top+c.height/2));
          if(a.height<=0||c.height<=0||delta>1.5)failures.push(b.type+': offset '+delta.toFixed(2));
        }
        // Force the real disabled-preview CSS class on an eligible block so
        // every category verifies centering at opacity 0.55, even when the
        // smoke-test HA fixture happens to provide all selected entities.
        const sample=blocks.find(b=>b.getField('HA_FILLED_ICON') && b.getSvgRoot());
        if(sample) {
          const root=sample.getSvgRoot(),image=sample.getField('HA_FILLED_ICON').getSvgRoot().querySelector('image');
          const path=sample.pathObject?.svgPath || root.querySelector('.blocklyPath');
          root.classList.add('ha-toolbox-unavailable');
          const opacity=Number(getComputedStyle(root).opacity);
          const a=image.getBoundingClientRect();
          const iconField=sample.getField('HA_FILLED_ICON');
          const c=iconField.getSvgRoot()?.getBoundingClientRect()||path.getBoundingClientRect();
          const deviation=Math.abs((a.top+a.height/2)-(c.top+c.height/2));
          if(opacity!==0.55 || deviation>1.5) failures.push('disabled preview CSS/center mismatch '+opacity+' '+deviation);
          root.classList.remove('ha-toolbox-unavailable');
          unavailableIcons++;
        }
        result[name]={total:blocks.length,entityIcons,leadingIcons,unavailableIcons,sunDropdowns,failures};
      }
      return result;
    });
    for(const [name,r] of Object.entries(native)) {
      assert.ok(r.total>0&&r.entityIcons>0&&r.leadingIcons>0,name+': '+JSON.stringify(r));
      assert.deepEqual(r.failures,[],name+': '+r.failures.join('; '));
      if(name!=='Action') assert.ok(r.sunDropdowns>0,name+': Sun dropdown icon coverage');
      assert.ok(r.unavailableIcons>0,name+': at least one missing-entity preview must be center-aligned');

    }
    // Block Search's preview has its own workspace and must also expose an
    // Entity icon without first placing a block on the editing workspace.
    await page.locator('svg.block-search-launcher').dispatchEvent('pointerdown');
    await page.locator('#blockSearchFlyoutInput').fill('light');
    const searchIconCount=await page.locator('.blocklyFlyout image[data-ha-actual-icon="true"]').count();
    assert.ok(searchIconCount>0,'Block Search must display entity dropdown icons');
    assert.deepEqual(errors,[],errors.join('\n'));
    console.log('PASS real-browser MDI smoke: filled settings, actual status, SVG layout, search and no workspace mutation');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
