const test=require('node:test');
const assert=require('node:assert/strict');
const {createClient}=require('../js/devin-connection-core.js');
const token='b'.repeat(64), id='11111111-1111-4111-8111-111111111111';
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const health={version:1,cliAvailable:true,compatible:true,code:'ready'};
test('unconfigured client does not probe localhost and clipboard stays usable',async()=>{
  let calls=0,copied;
  const client=createClient({fetchImpl:async()=>{calls++;return response(health);},sessionStorage:null,clipboard:{writeText:async v=>{copied=v;}}});
  assert.equal(client.isPaired(),false);assert.equal(calls,0);
  await client.copyPrompt('case details');assert.equal(copied,'case details');
  await assert.rejects(client.health(),{code:'unpaired'});assert.equal(calls,0);
});
test('pairing uses only a header, supports blocked storage, and clears on disconnect',async()=>{
  const requests=[];
  const client=createClient({fetchImpl:async(url,opts)=>{requests.push({url,opts});return response(health);},sessionStorage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}}});
  await client.connect(token);assert.equal(client.isPaired(),true);
  assert.equal(requests[0].opts.headers.Authorization,'Bearer '+token);
  assert.equal(requests[0].url,'http://127.0.0.1:43127/v1/health');
  assert.equal(requests[0].opts.credentials,'omit');
  client.disconnect();assert.equal(client.isPaired(),false);
});
test('denied network and uncertain submissions never retry or copy silently',async()=>{
  let calls=0,copies=0;
  const client=createClient({fetchImpl:async()=>{calls++;if(calls===1)return response(health);throw Error(token);},clipboard:{writeText:async()=>{copies++;}}});
  await client.connect(token);await assert.rejects(client.submit('hello'),e=>e.code==='uncertain'&&!e.message.includes(token));
  assert.equal(calls,2);assert.equal(copies,0);
  await client.copyPrompt('hello');assert.equal(copies,1);
});
test('stale token clears on 401 and exposes setup guidance',async()=>{
  let fail=false;const store=new Map();
  const client=createClient({sessionStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},fetchImpl:async()=>response(fail?{code:'unauthorized'}:health,fail?401:200)});
  await client.connect(token);fail=true;await assert.rejects(client.health(),{code:'unauthorized'});
  assert.equal(client.isPaired(),false);assert.equal(store.size,0);
});
test('response validation rejects unexpected states, oversize output, and malicious identifiers',async()=>{
  let next=health;const client=createClient({fetchImpl:async()=>response(next)});await client.connect(token);
  for(const bad of [{id,state:'invented',response:'',code:'ready'},{id,state:'completed',response:'x'.repeat(2*1024*1024+1),code:'completed'},{id:'../../escape',state:'completed',response:'okay',code:'completed'}]){
    next=bad;await assert.rejects(client.getJob(id),{code:'invalid_response'});
  }
  next={id:'22222222-2222-4222-8222-222222222222',state:'completed',response:'Another case',code:'completed'};
  await assert.rejects(client.getJob(id),{code:'invalid_response'});
  await assert.rejects(client.getJob('../escape'),{code:'invalid_job'});
});
test('clipboard failure is reported without exposing prompt',async()=>{
  const client=createClient({clipboard:{writeText:async()=>{throw Error('case data');}}});
  await assert.rejects(client.copyPrompt('secret case'),e=>e.code==='clipboard'&&!e.message.includes('secret case'));
});
