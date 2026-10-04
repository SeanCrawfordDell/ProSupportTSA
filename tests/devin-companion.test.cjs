const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http=require('node:http');
const {createRunner} = require('../companion/devin-runner.cjs');
const {createCompanion} = require('../companion/server.cjs');
const origin = 'https://seancrawforddell.github.io';
async function setup(t, options = {}) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'devin-test-'));
  const runner = createRunner({workspace, executable:process.execPath, prefixArgs:[path.join(__dirname,'fixtures/fake-devin.cjs')], ...options});
  const server = createCompanion({runner,token:'a'.repeat(64),allowedOrigins:[origin],port:0});
  await server.listen();
  t.after(async () => { await server.close(); await fs.rm(workspace,{recursive:true,force:true}); });
  const request = (route, extra = {}) => fetch(server.url + route, {
    ...extra, headers:{Origin:origin,Authorization:'Bearer '+ 'a'.repeat(64),...extra.headers}
  });
  return {runner,request,workspace,server};
}
async function finished(runner,id) {
  for (let i=0;i<200;i++) { const job=runner.get(id); if(job.state!=='running') return job; await new Promise(r=>setTimeout(r,10)); }
  throw Error('Job did not finish');
}
test('health and jobs require pairing and an allowed origin', async t=>{
  const {request,server}=await setup(t);
  assert.equal((await request('/v1/health',{headers:{Authorization:''}})).status,401);
  const wrongHost=await new Promise((resolve,reject)=>{http.get(server.url+'/v1/health',{headers:{Host:'attacker.test',Origin:origin,Authorization:'Bearer '+'a'.repeat(64)}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});
  assert.equal(wrongHost,403);
  for(const o of ['', 'null', 'https://attacker.test']) assert.equal((await request('/v1/health',{headers:{Origin:o}})).status,403);
  const health=await (await request('/v1/health')).json();
  assert.equal(health.compatible,true); assert.equal(health.cliAvailable,true);
  assert.equal((await request('/v1/unknown')).status,404);
});
test('preflight grants only exact origin and fixed headers',async t=>{
  const {request}=await setup(t);
  const r=await request('/v1/jobs',{method:'OPTIONS',headers:{Authorization:'','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type','Access-Control-Request-Private-Network':'true'}});
  assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),origin);
  assert.equal(r.headers.get('access-control-allow-private-network'),'true');
  assert.equal((await request('/v1/jobs',{method:'OPTIONS',headers:{'Access-Control-Request-Headers':'x-evil'}})).status,403);
});
test('request bounds and fields reject executable input',async t=>{
  const {request}=await setup(t);
  assert.equal((await request('/v1/jobs',{method:'POST',body:'x'})).status,415);
  for (const body of ['{bad',JSON.stringify({prompt:'hi',command:'evil'}),JSON.stringify({prompt:'  '})])
    assert.equal((await request('/v1/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body})).status,400);
  assert.equal((await request('/v1/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:'x'.repeat(256*1024)})})).status,413);
});
test('prompt file preserves Unicode and shell-like text; completion cleans files',async t=>{
  const {runner,request,workspace}=await setup(t);
  const prompt='Café 🛠\n$(Write-Host nope) "quotes" & <img src=x>';
  const r=await request('/v1/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt})});
  assert.equal(r.status,202);
  const {id}=await r.json(); const job=await finished(runner,id);
  assert.equal(job.state,'completed');assert.equal(job.response,'Reviewed: '+prompt+'\n');
  assert.deepEqual(await fs.readdir(workspace),[]);
  assert.equal((await (await request('/v1/jobs/'+id)).json()).response,job.response);
});
test('busy jobs reject duplicate submission and cancellation stops the child',async t=>{
  const {runner,workspace}=await setup(t);
  const {id}=await runner.submit('WAIT');
  await assert.rejects(runner.submit('second'),{code:'busy'});
  await runner.cancel(id);assert.equal(runner.get(id).state,'cancelled');
  assert.deepEqual(await fs.readdir(workspace),[]);
});
for (const [prompt,code] of [['AUTH','auth_required'],['TRUST','workspace_trust'],['BIG','output_limit'],['WAIT','timeout']])
  test('execution failure '+code+' is bounded and cleans up',async t=>{
    const {runner,workspace}=await setup(t,{timeoutMs:prompt==='WAIT'?100:3000});
    const {id}=await runner.submit(prompt);const job=await finished(runner,id);
    assert.equal(job.state,'failed');assert.equal(job.code,code);assert.equal(job.response,'');
    assert.deepEqual(await fs.readdir(workspace),[]);
  });
test('missing executable reports unavailable without exposing paths',async t=>{
  const {runner}=await setup(t,{executable:path.join(os.tmpdir(),'missing-devin.exe')});
  const health=await runner.health();assert.equal(health.cliAvailable,false);
  assert.equal(health.code,'cli_missing');
});
test('incompatible CLI cannot accept work',async t=>{
  const {runner}=await setup(t,{prefixArgs:[path.join(__dirname,'fixtures/fake-devin.cjs'),'--bad-help']});
  assert.equal((await runner.health()).code,'cli_incompatible');
  await assert.rejects(runner.submit('review'),{code:'cli_incompatible'});
});
test('expired jobs cannot be retrieved again',async t=>{
  const {runner}=await setup(t,{retentionMs:150});const {id}=await runner.submit('small');
  await finished(runner,id);await new Promise(r=>setTimeout(r,250));
  assert.throws(()=>runner.get(id),{code:'not_found'});
});
test('shutdown cancels running work and releases listener',async t=>{
  const {runner,server,workspace}=await setup(t);
  const {id}=await runner.submit('WAIT');await server.close();
  assert.equal(runner.get(id).state,'cancelled');assert.deepEqual(await fs.readdir(workspace),[]);
});
test('duplicate launch cannot clean another running helpers prompt directory',async t=>{
  const {runner,server,workspace}=await setup(t);
  const {id}=await runner.submit('WAIT');
  assert.equal((await fs.readdir(workspace)).length,1);
  const otherRunner=createRunner({workspace,executable:process.execPath,prefixArgs:[path.join(__dirname,'fixtures/fake-devin.cjs')]});
  const other=createCompanion({runner:otherRunner,token:'d'.repeat(64),allowedOrigins:[origin],port:Number(new URL(server.url).port)});
  await assert.rejects(other.listen(),{code:'EADDRINUSE'});await other.close();
  assert.equal((await fs.readdir(workspace)).length,1);assert.equal(runner.get(id).state,'running');
  await runner.cancel(id);
});
test('unattended runs pin Devin to normal permission checks when the CLI supports it',async t=>{
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'devin-test-'));t.after(()=>fs.rm(workspace,{recursive:true,force:true}));
  const fake=path.join(__dirname,'fixtures/fake-devin.cjs');
  for(const [extra,expected] of [[['--modern'],true],[[],false]]){
    const runner=createRunner({workspace,executable:process.execPath,prefixArgs:[fake,...extra]});
    const job=await finished(runner,(await runner.submit('ARGS')).id);
    const args=JSON.parse(job.response);
    assert.equal(args.includes('--permission-mode'),expected);
    if(expected)assert.equal(args[args.indexOf('--permission-mode')+1],'normal');
    await runner.close();
  }
});
test('relative PATH entries are never searched for the Devin executable',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'devin-path-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const name=process.platform==='win32'?'devin.exe':'devin';
  await fs.mkdir(path.join(dir,'rel'));await fs.writeFile(path.join(dir,'rel',name),'planted');
  const cwd=process.cwd(),PATH=process.env.PATH;
  process.chdir(dir);process.env.PATH='rel';
  try{const runner=createRunner({workspace:path.join(dir,'ws')});assert.equal((await runner.health()).code,'cli_missing');await runner.close();}
  finally{process.chdir(cwd);process.env.PATH=PATH;}
});
