const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const run=promisify(execFile);
const pwsh='C:\\Program Files\\PowerShell\\7\\pwsh.exe';
const script=path.resolve(__dirname,'../companion/Connect-Devin.ps1');
test('connection bootstrap fetches only its runtime files, forwards preview origin, and cleans staging', {skip:process.platform!=='win32'},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'devin-bootstrap-test-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const requests=[];
  const bootstrapSource=await fs.readFile(script,'utf8');
  const server=http.createServer((req,res)=>{
    requests.push(req.url);res.setHeader('Content-Type','text/plain');
    if(req.url==='/companion/Connect-Devin.ps1')res.end(bootstrapSource);
    else if(req.url==='/companion/server.cjs')res.end("console.log('STARTED '+JSON.stringify(process.argv.slice(2)));require('./devin-runner.cjs');");
    else if(req.url==='/companion/devin-runner.cjs')res.end("console.log('RUNNER LOADED');");
    else {res.statusCode=404;res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
  const origin=`http://127.0.0.1:${server.address().port}`;
  for(const shell of [pwsh,path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe')]){
    requests.length=0;
    const command="$devinLoader=New-Object Net.WebClient; $devinLoader.Encoding=[Text.Encoding]::UTF8; & ([scriptblock]::Create($devinLoader.DownloadString('"+origin+"/companion/Connect-Devin.ps1'))) -SourceBase '"+origin+"/companion' -AllowOrigin '"+origin+"'";
    const result=await run(shell,['-NoProfile','-Command',command],{env:{...process.env,TEMP:root,TMP:root}});
    assert.match(result.stdout,/STARTED \["--allow-origin","http:\/\/127\.0\.0\.1:\d+"\]/);
    assert.match(result.stdout,/RUNNER LOADED/);
    assert.deepEqual(requests,['/companion/Connect-Devin.ps1','/companion/server.cjs','/companion/devin-runner.cjs']);
    assert.deepEqual(await fs.readdir(root),[]);
  }
});
test('missing Node stops bootstrap before downloading anything', {skip:process.platform!=='win32'},async()=>{
  const result=await run(pwsh,['-NoProfile','-File',script],{env:{...process.env,PATH:''}});
  assert.match(result.stdout,/Node.js 22/);
});
test('bootstrap rejects arbitrary download hosts', {skip:process.platform!=='win32'},async()=>{
  const result=await run(pwsh,['-NoProfile','-File',script,'-SourceBase','https://example.com/companion']);
  assert.match(result.stdout,/Source must be/);
});
test('partial download failure never launches runtime and removes downloaded files', {skip:process.platform!=='win32'},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'devin-bootstrap-failure-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const server=http.createServer((req,res)=>{
    if(req.url.endsWith('/server.cjs'))res.end("console.log('MUST NOT START');");
    else{res.statusCode=503;res.end('unavailable');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
  const origin=`http://127.0.0.1:${server.address().port}`;
  const result=await run(pwsh,['-NoProfile','-File',script,'-SourceBase',origin+'/companion','-AllowOrigin',origin],{env:{...process.env,TEMP:root,TMP:root}});
  assert.match(result.stdout,/503/);assert.equal(result.stdout.includes('MUST NOT START'),false);
  assert.deepEqual(await fs.readdir(root),[]);
});
test('cleanup preserves unexpected staging files without a recursive-delete prompt', {skip:process.platform!=='win32'},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'devin-bootstrap-extra-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const server=http.createServer((req,res)=>res.end(req.url.endsWith('/server.cjs')?"require('node:fs').writeFileSync(require('node:path').join(__dirname,'unexpected.txt'),'preserve');":''));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
  const origin=`http://127.0.0.1:${server.address().port}`;
  const result=await run(pwsh,['-NoProfile','-File',script,'-SourceBase',origin+'/companion','-AllowOrigin',origin],{env:{...process.env,TEMP:root,TMP:root},timeout:5000});
  const [directory]=await fs.readdir(root);
  assert.deepEqual(await fs.readdir(path.join(root,directory)),['unexpected.txt']);
  assert.equal(await fs.readFile(path.join(root,directory,'unexpected.txt'),'utf8'),'preserve');
  assert.match(result.stdout,/left|remain|retained/i);
});
test('inline setup failure reports missing Node without closing the caller session', {skip:process.platform!=='win32'},async()=>{
  const command="& ([scriptblock]::Create([IO.File]::ReadAllText('"+script.replaceAll("'","''")+"'))); Write-Host 'CALLER STILL RUNNING'";
  const result=await run(pwsh,['-NoProfile','-Command',command],{env:{...process.env,PATH:''}});
  assert.match(result.stdout,/Node.js 22/);assert.match(result.stdout,/CALLER STILL RUNNING/);
});
