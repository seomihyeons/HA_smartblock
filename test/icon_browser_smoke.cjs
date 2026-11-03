// Executed by GitHub Actions against the real production webpack bundle.
// Uses a stubbed Home Assistant state endpoint; no HA credentials are required.
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const { chromium }=require('playwright');
const root=path.resolve(__dirname,'../dist');
let actual='off';
const fixture=()=>({source:'homeassistant',entities:[
  {entity_id:'light.living_room',state:actual,domain:'light',attributes:{friendly_name:'Living Room Light'}},
  {entity_id:'binary_sensor.living_motion',state:'off',domain:'binary_sensor',attributes:{friendly_name:'Living Motion',device_class:'motion'}},
  {entity_id:'person.test_user',state:'home',domain:'person',attributes:{friendly_name:'Test User'}},
]});
const server=http.createServer(async(req,res)=>{
  const requestPath=new URL(req.url,'http://localhost').pathname;
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
    await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'networkidle'});
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
    const baseline=await page.evaluate(id=>{
      const b=window.ws.getBlockById(id),f=b.getField('ENTITY_ID');
      const img=f.getSvgRoot().querySelector('image[data-ha-actual-icon="true"]');
      const arrow=f.getSvgRoot().querySelector('image:not([data-ha-actual-icon])');
      const bounds=img.getBoundingClientRect();
      const text=f.getTextElement().getBoundingClientRect();
      if(bounds.width<10 || bounds.height<10 || bounds.right>text.left+2) throw Error('Entity icon overlaps label: '+JSON.stringify({bounds:bounds.toJSON(),text:text.toJSON()}));
      return {filled:b.getField('HA_FILLED_ICON').getValue(),actual:img.getAttribute('href'),
        arrowBefore:arrow?.getAttribute('href'),saved:JSON.stringify(window.Blockly.serialization.workspaces.save(window.ws))};
    },initial);
    actual='on';
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
    assert.deepEqual(errors,[],errors.join('\n'));
    console.log('PASS real-browser MDI smoke: filled settings, actual status, SVG layout, search and no workspace mutation');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
