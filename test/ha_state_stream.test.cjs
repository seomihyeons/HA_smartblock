const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createHaStateStream } = require('../ha_smartblock/server/ha_state_stream.js');

class FakeSocket extends EventEmitter {
  static instances = [];
  constructor(url, options) {
    super();
    this.url = url;
    this.options = options;
    this.commands = [];
    FakeSocket.instances.push(this);
  }
  send(text) { this.commands.push(JSON.parse(text)); }
  terminate() { this.emit('close'); }
  close() { this.emit('close'); }
  message(payload) { this.emit('message', JSON.stringify(payload)); }
}

function request() {
  const req = new EventEmitter();
  const res = new EventEmitter();
  res.chunks = [];
  res.writeHead = (code, headers) => {
    res.code = code;
    res.headers = headers;
  };
  res.flushHeaders = () => {};
  res.write = (text) => { res.chunks.push(text); return true; };
  res.end = () => { res.writableEnded = true; res.emit('close'); };
  return { req, res };
}

function normalized(row) {
  return { entity_id: row.entity_id, state: row.state,
    attributes: row.attributes || {}, domain: row.entity_id.split('.')[0] };
}

test('one authenticated HA websocket subscription broadcasts only state icon updates to all SSE clients', () => {
  FakeSocket.instances.length = 0;
  const stream = createHaStateStream({
    getUrl: () => 'ws://supervisor/core/api/websocket',
    getToken: () => 'secret-test-token',
    normalizeEntity: normalized,
    WebSocketImpl: FakeSocket,
    heartbeatMs: 60000,
  });
  const a = request(), b = request();
  stream.handle(a.req, a.res);
  stream.handle(b.req, b.res);
  assert.equal(FakeSocket.instances.length, 1);
  const ws = FakeSocket.instances[0];
  assert.equal(ws.url, 'ws://supervisor/core/api/websocket');
  ws.message({ type:'auth_required' });
  assert.deepEqual(ws.commands[0], { type:'auth', access_token:'secret-test-token' });
  ws.message({ type:'auth_ok' });
  assert.deepEqual(ws.commands[1], {id:1,type:'subscribe_events',event_type:'state_changed'});
  ws.message({ type:'result',id:1,success:true });
  ws.message({ type:'event',id:1,event:{data:{
    entity_id:'light.living_room',
    new_state:{entity_id:'light.living_room',state:'on',attributes:{friendly_name:'Living Room Light'}},
  }}});
  for (const response of [a.res,b.res]) {
    const text = response.chunks.join('');
    assert.match(text, /event: status/);
    assert.match(text, /event: sync/);
    assert.match(text, /event: state/);
    assert.match(text, /"state":"on"/);
    assert.doesNotMatch(text, /secret-test-token/);
  }
  ws.message({ type:'event',id:1,event:{data:{
    entity_id:'light.living_room',new_state:null,
  }}});
  assert.match(a.res.chunks.join(''), /"entity":null/);
  a.req.emit('close');
  assert.equal(FakeSocket.instances.length, 1);
  b.req.emit('close');
  stream.stop();
});

test('a disconnected HA state stream reports unavailable without leaking auth details', () => {
  FakeSocket.instances.length = 0;
  const stream = createHaStateStream({
    getUrl:()=> 'ws://supervisor/core/api/websocket',
    getToken:()=> 'secret',
    normalizeEntity:normalized,
    WebSocketImpl:FakeSocket,
    retryMinMs:100000,
  });
  const { req,res } = request();
  stream.handle(req,res);
  const ws = FakeSocket.instances[0];
  ws.message({type:'auth_required'});
  ws.message({type:'auth_ok'});
  ws.message({type:'result',id:1,success:true});
  ws.emit('close');
  assert.match(res.chunks.join(''), /"connected":false/);
  assert.doesNotMatch(res.chunks.join(''), /secret/);
  req.emit('close');
  stream.stop();
});
