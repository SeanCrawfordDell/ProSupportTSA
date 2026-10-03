const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
test('downloaded package matches helper source and starts an authenticated loopback endpoint', {skip:process.platform!=='win32'}, async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'devin-package-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const archive=path.resolve(__dirname,'../downloads/DevinCompanion.zip');
  // PowerShell paths are arguments, never interpolation into executable commands.
  const script='param($archive,$destination) Expand-Archive -LiteralPath $archive -DestinationPath $destination';
  const extract=path.join(root,'extract.ps1');await fs.writeFile(extract,script);
  await promisify(execFile)('C:\\Program Files\\PowerShell\\7\\pwsh.exe',['-NoProfile','-File',extract,archive,path.join(root,'package')]);
  const dir=path.join(root,'package');
  assert.deepEqual((await fs.readdir(dir)).sort(),['README.md','Start-DevinCompanion.ps1','devin-runner.cjs','server.cjs'].sort());
  for(const file of ['server.cjs','devin-runner.cjs','Start-DevinCompanion.ps1','README.md'])assert.deepEqual(await fs.readFile(path.join(dir,file)),await fs.readFile(path.resolve(__dirname,'../companion',file)));
  // Test the extracted real endpoint on an ephemeral port, not the user's live connection.
  const smoke="const path=require('node:path');const {createCompanion}=require('./server.cjs');const {createRunner}=require('./devin-runner.cjs');const token=require('node:crypto').randomBytes(32).toString('hex');const app=createCompanion({port:0,token,allowedOrigins:['http://127.0.0.1:4187'],runner:createRunner({workspace:path.join(process.env.LOCALAPPDATA,'workspace')})});app.listen().then(()=>console.log(app.url+'\\nPairing token (keep private): '+token));process.on('SIGTERM',()=>app.close().then(()=>process.exit()));";
  const child=spawn(process.execPath,['-e',smoke],{cwd:dir,env:{...process.env,LOCALAPPDATA:path.join(root,'data')},windowsHide:true,stdio:['ignore','pipe','pipe']});
  t.after(()=>{child.kill();});
  let token,url;
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Package endpoint did not start')),5000);let output='';
    child.stdout.on('data',chunk=>{output+=chunk;const match=/Pairing token \(keep private\): ([a-f0-9]{64})/.exec(output),endpoint=/http:\/\/127\.0\.0\.1:\d+/.exec(output);if(match&&endpoint){token=match[1];url=endpoint[0];clearTimeout(timer);resolve();}});
    child.on('exit',()=>{clearTimeout(timer);reject(Error('Package stopped before startup'));});
  });
  const headers={Origin:'http://127.0.0.1:4187'};
  assert.equal((await fetch(url+'/v1/health',{headers})).status,401);
  const health=await (await fetch(url+'/v1/health',{headers:{...headers,Authorization:'Bearer '+token}})).json();
  assert.equal(health.version,1);assert.equal(typeof health.cliAvailable,'boolean');
  child.kill();await new Promise(resolve=>child.once('exit',resolve));
});
