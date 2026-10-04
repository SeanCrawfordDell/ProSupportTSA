const test=require('node:test');
const assert=require('node:assert/strict');
const {init}=require('../js/devin-integration.js');
const {createClient}=require('../js/devin-connection-core.js');
function harness({storageBlocked=false,isPopout=false,seen=false,href,clipboardBlocked=false}={}) {
  const nodes=new Map(),local=new Map(),scheduled=[],docListeners={};
  if(seen)local.set('dell-support.devin-onboarding.v1','1');
  function node(tag='div') {
    const e={tagName:tag.toUpperCase(),children:[],listeners:{},textContent:'',value:'',disabled:false,hidden:false,open:false,
      set id(v){this._id=v;nodes.set(v,this);},get id(){return this._id;},
      append(...items){this.children.push(...items);},setAttribute(k,v){this[k]=v;},addEventListener(k,v){const previous=this.listeners[k];this.listeners[k]=event=>{previous?.(event);return v(event);};},
      showModal(){this.open=true;},close(){this.open=false;this.listeners.close?.();},focus(){},select(){},
      async click(){if(!this.disabled)return this.listeners.click?.({preventDefault(){}});}};
    return e;
  }
  for(const id of ['aiSettings','sendDevin','copyDevin','devinStatus']){const el=node('button');el.id=id;}
  const env={document:{body:node(),createElement:node,getElementById:id=>nodes.get(id),querySelector:()=>[...nodes.values()].find(n=>n.tagName==='DIALOG'&&n.open),addEventListener:(k,f)=>{docListeners[k]=f;}},
    localStorage:{getItem:k=>{if(storageBlocked)throw Error('blocked');return local.get(k);},setItem:(k,v)=>{if(storageBlocked)throw Error('blocked');local.set(k,v);}},
    location:{href},setTimeout:f=>{scheduled.push(f);return scheduled.length;},clearTimeout(){},addEventListener(){}};
  let submissions=[],copied=[],prompt='Original case',caseId='case-a',allowAppend=true,appended=[],hold=false,resolveHeld,missing=false;
  const jobId='11111111-1111-4111-8111-111111111111';
  const client=createClient({fetchImpl:async(url,opts)=>{
    let body;if(url.endsWith('/health'))body={version:1,cliAvailable:true,compatible:true,code:'ready'};
    else if(opts.method==='POST'){submissions.push(JSON.parse(opts.body));body={id:jobId,state:'running'};}
    else {
      if(opts.method==='GET'&&hold){hold=false;await new Promise(resolve=>{resolveHeld=resolve;});}
      if(missing)return new Response(JSON.stringify({code:'not_found'}),{status:404});
      body={id:jobId,state:opts.method==='DELETE'?'cancelled':'completed',response:opts.method==='DELETE'?'':'<img src=x onerror=evil()> Review',code:opts.method==='DELETE'?'cancelled':'completed'};
    }
    return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
  },clipboard:{writeText:async text=>{if(clipboardBlocked)throw Error('blocked');copied.push(text);}}});
  const api=init({client,sourceLabel:'Case Notes',isPopout,snapshot:()=>({caseId,prompt}),
    canAppend:id=>allowAppend&&id===caseId,appendResponse:(id,text)=>{if(!allowAppend||id!==caseId)return false;appended.push({id,text});return true;}},env);
  return {nodes,api,client,local,scheduled,docListeners,submissions,copied,appended,holdPoll:()=>{hold=true;},releasePoll:()=>resolveHeld(),missingJob:()=>{missing=true;},changeCase:()=>{caseId='case-b';},changePrompt:()=>{prompt='Changed case';},blockAppend:()=>{allowAppend=false;}};
}
async function flush(h){const pending=h.scheduled.splice(0);for(const f of pending)await f();}
test('first visit shows an inline hint, never an automatic dialog',async()=>{
  const h=harness();await flush(h);assert.equal(h.nodes.get('devinIntro').open,false);
  assert.equal(h.nodes.get('devinHint').hidden,false);
  await h.nodes.get('devinHintMore').click();assert.equal(h.nodes.get('devinIntro').open,true);
  h.nodes.get('devinIntro').listeners.cancel({preventDefault(){}});assert.equal(h.nodes.get('devinIntro').open,false);
  assert.equal(h.local.get('dell-support.devin-onboarding.v1'),'1');assert.equal(h.nodes.get('devinHint').hidden,true);
  h.api.openSettings();assert.equal(h.nodes.get('devinSetup').open,true);
});
test('dismissing the hint records acknowledgment',async()=>{
  const h=harness();await h.nodes.get('devinHintDismiss').click();
  assert.equal(h.nodes.get('devinHint').hidden,true);assert.equal(h.local.get('dell-support.devin-onboarding.v1'),'1');
});
test('setup copies a connection command without sending case data or showing a ZIP link',async()=>{
  const h=harness({seen:true});h.api.openSettings();
  assert.ok(h.nodes.get('devinCopyConnectionCommand'),'one-command setup is available');
  await h.nodes.get('devinCopyConnectionCommand').click();
  assert.equal(h.copied.length,1);
  assert.match(h.copied[0],/https:\/\/raw\.githubusercontent\.com\/SeanCrawfordDell\/EscalationQuality\/[0-9a-f]{40}\/companion\/Connect-Devin\.ps1'\)\)\) -SourceBase 'https:\/\/raw\.githubusercontent\.com\/SeanCrawfordDell\/EscalationQuality\/[0-9a-f]{40}\/companion'$/);
  assert.equal(h.copied[0].includes('/main/'),false,'never a moving branch');
  assert.equal(h.copied[0].includes('Original case'),false);
  assert.equal(h.submissions.length,0);
  const walk=n=>[n,...n.children.flatMap(walk)];
  assert.equal(walk(h.nodes.get('devinSetup')).some(n=>n.href?.endsWith('.zip')),false);
});
test('preview connection command uses only an explicit loopback origin',async()=>{
  for(const [href,local] of [['http://127.0.0.1:4187/case-notes.html',true],['https://evil.example/case-notes.html',false]]){
    const h=harness({seen:true,href});await h.nodes.get('devinCopyConnectionCommand').click();
    assert.equal(h.copied[0].includes("-AllowOrigin 'http://127.0.0.1:4187'"),local);
    assert.equal(h.copied[0].includes('evil.example'),false);
    if(local)assert.match(h.copied[0],/http:\/\/127\.0\.0\.1:4187\/companion\/Connect-Devin.ps1/);
  }
});
test('blocked clipboard leaves the connection command visible for manual copying',async()=>{
  const h=harness({seen:true,clipboardBlocked:true});await h.nodes.get('devinCopyConnectionCommand').click();
  assert.match(h.nodes.get('devinConnectionCommandStatus').textContent,/select the text/);
  assert.match(h.nodes.get('devinConnectionCommand').value,/Connect-Devin.ps1/);
  assert.equal(h.submissions.length,0);
});
test('popout and acknowledged visits do not show introduction',async()=>{
  for(const options of [{isPopout:true},{seen:true}]){const h=harness(options);await flush(h);assert.equal(h.nodes.get('devinIntro').open,false);assert.equal(h.nodes.has('devinHint'),false);assert.equal(h.submissions.length,0);}
});
test('blocked storage still permits continuing with clipboard and reopening setup',async()=>{
  const h=harness({storageBlocked:true});await flush(h);await h.nodes.get('devinHintMore').click();await h.nodes.get('devinIntroSkip').click();
  assert.equal(h.nodes.get('devinIntro').open,false);h.api.openSettings();assert.equal(h.nodes.get('devinSetup').open,true);
});
async function connect(h){h.api.openSettings();h.nodes.get('devinPairingToken').value='b'.repeat(64);await h.nodes.get('devinConnect').click();h.nodes.get('devinSetup').close();}
test('prompt review snapshots current case and submits only on explicit Send',async()=>{
  const h=harness({seen:true});await connect(h);await h.nodes.get('sendDevin').click();h.changePrompt();
  assert.equal(h.nodes.get('devinPromptText').value,'Original case');assert.equal(h.submissions.length,0);
  await h.nodes.get('devinSubmit').click();assert.deepEqual(h.submissions,[{prompt:'Original case'}]);
  await flush(h);assert.equal(h.nodes.get('devinResponseText').value,'<img src=x onerror=evil()> Review');
  assert.equal(h.appended.length,0);await h.nodes.get('devinCopyResponse').click();assert.equal(h.copied[0],'<img src=x onerror=evil()> Review');
});
test('late response cannot append to a different or locked case',async()=>{
  for(const changed of ['changeCase','blockAppend']){
    const h=harness({seen:true});await connect(h);await h.nodes.get('sendDevin').click();await h.nodes.get('devinSubmit').click();
    h[changed]();await flush(h);await h.nodes.get('devinAppendResponse').click();assert.equal(h.appended.length,0);
  }
});
test('cancel before submit sends nothing and completed response appends only by explicit action',async()=>{
  const h=harness({seen:true});await connect(h);await h.nodes.get('sendDevin').click();h.nodes.get('devinRequest').close();assert.equal(h.submissions.length,0);
  await h.nodes.get('sendDevin').click();await h.nodes.get('devinSubmit').click();await flush(h);
  await h.nodes.get('devinAppendResponse').click();assert.equal(h.appended.length,1);assert.equal(h.appended[0].id,'case-a');
  await h.nodes.get('devinAppendResponse').click();assert.equal(h.appended.length,1);
});
test('response completed while dialog closed can be reopened without losing it',async()=>{
  const h=harness({seen:true});await connect(h);await h.nodes.get('sendDevin').click();await h.nodes.get('devinSubmit').click();
  h.nodes.get('devinRequest').close();await flush(h);await h.nodes.get('sendDevin').click();
  assert.equal(h.nodes.get('devinResponseText').value,'<img src=x onerror=evil()> Review');
  assert.equal(h.nodes.get('devinResponseText').hidden,false);assert.equal(h.nodes.get('devinCopyResponse').hidden,false);
  assert.equal(h.submissions.length,1);
});
test('expired helper job is terminal and permits an explicit new request',async()=>{
  const h=harness({seen:true});await connect(h);await h.nodes.get('sendDevin').click();await h.nodes.get('devinSubmit').click();
  h.missingJob();await flush(h);assert.equal(h.nodes.get('devinResume').hidden,true);
  assert.match(h.nodes.get('devinRequestStatus').textContent,/expired|restarted/);
  assert.equal(h.nodes.get('devinNewRequest').hidden,false);await h.nodes.get('devinNewRequest').click();
  h.changePrompt();await h.nodes.get('sendDevin').click();assert.equal(h.nodes.get('devinPromptText').value,'Changed case');
});
test('late poll after cancellation cannot overwrite a new case prompt or response',async()=>{
  const h=harness({seen:true});await connect(h);await h.nodes.get('sendDevin').click();await h.nodes.get('devinSubmit').click();
  h.holdPoll();const waiting=flush(h);await Promise.resolve();await h.nodes.get('devinCancelJob').click();
  await h.nodes.get('devinNewRequest')?.click();h.changeCase();h.changePrompt();await h.nodes.get('sendDevin').click();
  h.releasePoll();await waiting;
  assert.equal(h.nodes.get('devinPromptText').value,'Changed case');assert.equal(h.nodes.get('devinCopyResponse').hidden,true);
  await h.nodes.get('devinAppendResponse').click();assert.equal(h.appended.length,0);
});

test('pinned bootstrap checksums match the committed runtime files',()=>{
  const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
  const ps=fs.readFileSync(path.join(__dirname,'../companion/Connect-Devin.ps1'),'utf8');
  for(const file of ['server.cjs','devin-runner.cjs']){
    const expected=ps.match(new RegExp("'"+file.replace('.','\\.')+"'\\s*=\\s*'([0-9a-f]{64})'"))?.[1];
    const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../companion',file))).digest('hex');
    assert.equal(expected,actual,file+' checksum in Connect-Devin.ps1 is out of date');
  }
});
