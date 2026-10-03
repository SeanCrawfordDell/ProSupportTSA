'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn, execFile} = require('node:child_process');
const LIMIT = 2 * 1024 * 1024;
function fault(code) { return Object.assign(new Error(code), {code}); }
async function findDevin() {
  const name = process.platform === 'win32' ? 'devin.exe' : 'devin';
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.resolve(dir.replace(/^"|"$/g,''), name);
    try { if ((await fs.stat(candidate)).isFile()) return candidate; } catch {}
  }
  return null;
}
function killTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    const taskkill=path.join(process.env.SystemRoot || 'C:\\Windows','System32','taskkill.exe');
    execFile(taskkill, ['/PID',String(child.pid),'/T','/F'], {windowsHide:true}, error => {if(error)try{child.kill();}catch{}});
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch {} }
  }
}
function createRunner({workspace, executable, prefixArgs=[], timeoutMs=600000, retentionMs=900000}) {
  const root = path.resolve(workspace), jobs = new Map();
  let active = null, closed = false;
  let ready;
  // Constructing a second helper must not touch the first helper's workspace.
  // The HTTP listener owns the fixed port before the first request initializes it.
  const ensureReady = () => ready ||= (async () => {
    await fs.mkdir(root,{recursive:true});
    for (const entry of await fs.readdir(root,{withFileTypes:true})) {
      if (/^job-[a-f0-9-]{36}$/.test(entry.name) && entry.isDirectory() && !entry.isSymbolicLink())
        await fs.rm(path.join(root,entry.name),{recursive:true,force:true});
    }
  })();
  async function health() {
    await ensureReady();
    const bin = executable || await findDevin();
    if (!bin) return {version:1,cliAvailable:false,compatible:false,code:'cli_missing'};
    return new Promise(resolve => {
      let output='', done=false, exceeded=false;
      const child=spawn(bin,[...prefixArgs,'--help'],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});
      const timer=setTimeout(()=>{killTree(child);finish(false,'cli_unavailable');},5000);
      function finish(available,code) {
        if(done)return;done=true;clearTimeout(timer);
        const compatible=available && !exceeded && output.includes('--print') && output.includes('--prompt-file');
        resolve({version:1,cliAvailable:available,compatible,code:compatible?'ready':code || 'cli_incompatible'});
      }
      for(const stream of [child.stdout,child.stderr]) stream.on('data',chunk=>{
        if(Buffer.byteLength(output)+chunk.length>65536) { exceeded=true;killTree(child); } else output+=chunk.toString();
      });
      child.on('error',()=>finish(false,'cli_missing'));
      child.on('close',code=>finish(code===0,code===0?'cli_incompatible':'cli_unavailable'));
    });
  }
  function view(job) { return {id:job.id,state:job.state,response:job.response,code:job.code}; }
  function get(id) {
    const job=jobs.get(id);
    if(!job || (job.finishedAt && Date.now()-job.finishedAt>=retentionMs)) {jobs.delete(id);throw fault('not_found');}
    return view(job);
  }
  async function submit(prompt) {
    if(closed)throw fault('unavailable');
    if(active)throw fault('busy');
    if(typeof prompt!=='string'||!prompt.trim()||Buffer.byteLength(prompt)>256*1024)throw fault('invalid_prompt');
    const job={id:crypto.randomUUID(),state:'running',response:'',code:'running',child:null,reason:null};
    active=job;
    try {
      await ensureReady();
      const status=await health();if(!status.compatible)throw fault(status.code);
      const bin=executable || await findDevin();if(!bin)throw fault('cli_missing');
      if(closed)throw fault('unavailable');
      const dir=path.join(root,'job-'+job.id);await fs.mkdir(dir);
      job.dir=dir;
      const file=path.join(dir,'prompt.txt');await fs.writeFile(file,prompt,{encoding:'utf8',mode:0o600});
      if(closed)throw fault('unavailable');
      jobs.set(job.id,job);
      job.done=new Promise(resolve => {
        let stdout=[],stderr=[],bytes=0,settled=false;
        const child=job.child=spawn(bin,[...prefixArgs,'--print','--prompt-file',file],{
          cwd:root,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'
        });
        const timer=setTimeout(()=>{job.reason='timeout';killTree(child);},timeoutMs);
        async function finish(exitCode,error=false) {
          if(settled)return;settled=true;clearTimeout(timer);
          const err=Buffer.concat(stderr).toString('utf8');
          const code=job.reason || (error?'execution_failed':exitCode===0?'completed':
            /auth|log.?in|sign.?in|unauthorized/i.test(err)?'auth_required':
            /trust|untrusted/i.test(err)?'workspace_trust':'execution_failed');
          // Keep work marked active until prompt cleanup has finished.
          try {await fs.rm(dir,{recursive:true,force:true});} catch {job.reason='cleanup_failed';}
          job.code=job.reason || code;
          job.response=job.code==='completed'?Buffer.concat(stdout).toString('utf8'):'';
          job.state=job.code==='completed'?'completed':job.code==='cancelled'?'cancelled':'failed';
          job.finishedAt=Date.now();if(active===job)active=null;
          const expiry=setTimeout(()=>jobs.delete(job.id),retentionMs);expiry.unref();
          resolve();
        }
        for(const [stream,target] of [[child.stdout,stdout],[child.stderr,stderr]]) stream.on('data',chunk=>{
          bytes+=chunk.length;
          if(bytes>LIMIT){job.reason='output_limit';killTree(child);}else target.push(chunk);
        });
        child.on('error',()=>void finish(null,true));child.on('close',code=>void finish(code));
      });
      return view(job);
    } catch(error) {
      if(job.dir)await fs.rm(job.dir,{recursive:true,force:true}).catch(()=>{});
      if(active===job)active=null;throw error;
    }
  }
  async function cancel(id) {
    const job=jobs.get(id);if(!job)throw fault('not_found');
    if(job.state==='running'){job.reason='cancelled';killTree(job.child);await job.done;}
    return view(job);
  }
  async function close() {closed=true;if(active?.child)await cancel(active.id);if(ready)await ready;}
  return {health,submit,get,cancel,close};
}
module.exports={createRunner};
