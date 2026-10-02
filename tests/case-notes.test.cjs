const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const C = require('../case-notes-core.js');
test('Backup Settings saves latest and dated settings in the configured folder without changing note backups', async () => {
  const files=new Map();let closed=0;
  const folder={queryPermission:async()=> 'granted',async getFileHandle(name,options){assert.equal(options.create,true);return {async createWritable(){return {async write(value){files.set(name,value);},async close(){closed++;}};}};}};
  const h=harness({folder});await new Promise(setImmediate);
  await h.click('downloadSettings');
  assert.equal(files.size,2);assert.equal(closed,2);
  const latest=JSON.parse(files.get('customer-config.json'));
  assert.ok(latest.fieldConfig);assert.ok(latest.toolbox);assert.ok(latest.preferences);
  assert.ok([...files.keys()].some(name=>/^customer-config-.+\.json$/.test(name)));
  assert.ok(![...files.keys()].some(name=>name.startsWith('case-history-')));
  assert.equal(h.ctx.localStorage.getItem('dell-support.last-backup-at'),null);
  assert.match(h.get('backupFolderStatus').textContent,/Settings saved to ProSupportToolsBackup/);
});
test('Backup Settings requests folder access and leaves files untouched when denied', async () => {
  let requests=0,writes=0;
  const folder={queryPermission:async()=> 'prompt',requestPermission:async()=>{requests++;return 'denied';},async getFileHandle(){writes++;}};
  const h=harness({folder});await new Promise(setImmediate);await h.click('downloadSettings');
  assert.equal(requests,1);assert.equal(writes,0);
  assert.match(h.get('backupFolderStatus').textContent,/Settings were not exported/);
});
test('Backup Settings aborts failed writes and allows retry', async () => {
  let fail=true,aborts=0;
  const folder={queryPermission:async()=> 'granted',async getFileHandle(){return {async createWritable(){return {async write(){if(fail)throw Error('disk full');},async close(){},async abort(){aborts++;}};}};}};
  const h=harness({folder});await new Promise(setImmediate);await h.click('downloadSettings');
  assert.equal(aborts,1);assert.match(h.get('backupFolderStatus').textContent,/did not finish/);
  fail=false;await h.click('downloadSettings');assert.match(h.get('backupFolderStatus').textContent,/Settings saved/);
});
test('Backup Settings downloads a file when no backup folder is connected', async () => {
  const h=harness();const downloads=[];
  h.ctx.URL={createObjectURL(blob){downloads.push(blob);return 'blob:test';},revokeObjectURL(){}};
  h.ctx.Blob=Blob;h.ctx.setTimeout=()=>{};
  h.ctx.document.body={append(link){link.remove=()=>{};}};
  await h.click('downloadSettings');
  assert.equal(downloads.length,1);assert.ok(JSON.parse(await downloads[0].text()).toolbox);
  assert.match(h.get('backupFolderStatus').textContent,/Settings download started/);
});
test('automatic folder backups write notes and settings and skip unchanged data', async () => {
  const files = new Map(); let requests=0;
  const folder={queryPermission:async()=> 'granted',requestPermission:async()=>{requests++;return 'granted';},async getFileHandle(name){return {async createWritable(){return {async write(value){files.set(name,value);},async close(){}};}};}};
  const h=harness({folder});await new Promise(setImmediate);
  h.click('newNote');h.edit('notes','Backup test');await h.click('stopTimer');
  const backup=h.intervals.find(i=>i.ms===60000).f;await backup();
  assert.equal(files.size,3);assert.equal(requests,0);
  assert.ok([...files].some(([name,body])=>name.startsWith('case-history-')&&JSON.parse(body).cases[0].notes==='Backup test'));
  assert.ok(JSON.parse(files.get('customer-config.json')).preferences.aiTasks);
  assert.match(h.get('backupFolderStatus').textContent,/Last successful backup/);
  files.clear();await backup();assert.equal(files.size,0);
});
test('automatic folder backups pause without prompting when permission is missing', async () => {
  let writes=0,requests=0;
  const folder={queryPermission:async()=> 'prompt',requestPermission:async()=>{requests++;return 'granted';},async getFileHandle(){writes++;throw Error('unexpected write');}};
  const h=harness({folder});await new Promise(setImmediate);h.click('newNote');
  await h.intervals.find(i=>i.ms===60000).f();
  assert.equal(writes,0);assert.equal(requests,0);assert.match(h.get('backupFolderStatus').textContent,/Reconnect Backup Folder/);
});
test('failed folder writes report failure and can retry', async () => {
  let fail=true;
  const folder={queryPermission:async()=> 'granted',async getFileHandle(){if(fail)throw Error('disk full');return {async createWritable(){return {async write(){},async close(){}};}};}};
  const h=harness({folder});await new Promise(setImmediate);h.click('newNote');
  const backup=h.intervals.find(i=>i.ms===60000).f;await backup();
  assert.match(h.get('backupFolderStatus').textContent,/Automatic backup failed/);
  assert.match(h.get('backupFolderStatus').textContent,/No successful folder backup yet/);
  fail=false;await backup();assert.match(h.get('backupFolderStatus').textContent,/Last successful backup/);
});
test('history keeps 100 newest cases, stops previous timer, and restores selected case', () => {
  const state = C.empty();
  for(let i=0;i<101;i++) C.create(state,String(i),i*1000);
  assert.equal(state.cases.length,100); assert.equal(state.cases.at(-1).id,'1');
  assert.equal(state.cases.filter(n=>n.started!==null).length,1);
  assert.equal(C.parse(JSON.stringify(state)).selected,'100');
});
test('timestamps survive closure, resume adds time, copy includes every field and line breaks', () => {
  const state=C.empty(), note=C.create(state,'a',1000);
  note.notes='First line\nSecond line';
  assert.equal(C.elapsed(C.parse(JSON.stringify(state)).cases[0],11000),10000);
  C.stop(note,11000);C.start(state,note,21000);
  assert.equal(C.elapsed(note,26000),15000);
  const text=C.copyText(note,26000);
  for(const label of Object.values(C.fields))assert.ok(text.includes(label+':\n'));
  assert.ok(text.includes('First line\nSecond line'));assert.ok(text.endsWith('00:00:15'));
  assert.throws(()=>C.parse('{bad'));assert.throws(()=>C.parse('{"version":2}'));
});
function harness({writeError=false,copyError=false,locked=false,folder=null}={}) {
  const elements={}, intervals=[], events={};let stored=null, now=1000;
  const preferences = new Map();
  function element(){
    const classes = new Set();
    const el={
      options:[],_children:[],
      get children(){return this._children},set children(v){this._children=v},
      querySelectorAll(){return []},
      querySelector(sel){
        if(sel==='[id]')return this.id?this:this._children.find(c=>typeof c==='object'&&c&&c.querySelector&&c.querySelector('[id]'))?.querySelector('[id]');
        return this._children.find(c=>typeof c==='object'&&((sel.startsWith('.')&&c.className===sel.slice(1))||(sel==='textarea'&&c.tagName==='TEXTAREA')));
      },
      value:'',_innerHTML:'',
      get innerHTML(){return this._innerHTML},set innerHTML(v){this._innerHTML=v;if(v==='')this._children=[]},
      hidden:false,disabled:false,textContent:'',className:'',open:false,clickCount:0,
      showModal(){this.open=true;},close(){this.open=false;},click(){this.clickCount++;this.listeners.click?.();},
      classList:{toggle(name,enabled){if(enabled ?? !classes.has(name))classes.add(name);else classes.delete(name);},contains(name){return classes.has(name);}},listeners:{},setAttribute(){},
      append(...items){for(const item of items)this._children.push(item)},
      appendChild(item){this._children.push(item);return item},
      replaceChildren(...items){this._children=items},
      addEventListener(k,f){this.listeners[k]=f},focus(){}
    };
    return el;
  }
  const get=id=>elements[id]??=element();
  // Pre-populate the field grid to mirror case-notes.html's default field containers,
  // so render()'s DOM reordering logic (which walks .field-grid children) works in tests.
  const html=fs.readFileSync(require.resolve('../case-notes.html'),'utf8');
  const gridMatch=/<fieldset id="fields"[^>]*><div class="field-grid">([\s\S]*?)<\/div>\s*<\/fieldset>/.exec(html);
  const fieldGrid=element(); fieldGrid.className='field-grid';
  if(gridMatch){
    for(const m of gridMatch[1].matchAll(/<label class="field">[^<]*<(?:input|select|textarea)[^>]*\bid="([^"]+)"/g)){
      const input=get(m[1]);
      const container=element(); container.className='field';
      container.querySelector=sel=>sel==='[id]'?input:null;
      fieldGrid.appendChild(container);
    }
  }
  get('fields').querySelector=sel=>sel==='.field-grid'?fieldGrid:null;
  const ctx={confirm:()=>true,CaseNotes:C,DevinPrompt:require('../devin-prompt-core.js'),document:{getElementById:get,createElement:element,createElementNS:element,addEventListener(k,f){events[k]=f}},window:{addEventListener(k,f){events[k]=f}},localStorage:{getItem:()=>stored,setItem(k,v){if(writeError)throw Error('full');stored=v}},navigator:{locks:{request(k,f){if(!locked)return f();return new Promise(()=>{})}},clipboard:{async writeText(text){if(copyError)throw Error('denied');ctx.copied=text}}},crypto:{randomUUID:()=>String(now)},Date:class extends Date{static now(){return now}},setInterval(f,ms){intervals.push({f,ms})},Promise,console};
  ctx.CaseSettings = require('../case-settings-core.js');
  ctx.localStorage = {
    getItem(k){return k==='dell-support.case-notes.v1' ? stored : preferences.get(k) ?? null;},
    setItem(k,v){if(writeError)throw Error('full');if(k==='dell-support.case-notes.v1')stored=v;else preferences.set(k,v);},
    removeItem(k){preferences.delete(k);}
  };
  if (folder) {
    ctx.window.showDirectoryPicker=async()=>folder;
    ctx.indexedDB={open(){
      const request={};
      queueMicrotask(()=>{
        request.result={close(){},transaction(){
          const transaction={objectStore(){return {get(){return {result:folder};}};}};
          queueMicrotask(()=>transaction.oncomplete());return transaction;
        }};
        request.onsuccess();
      });return request;
    }};
  }
  vm.runInNewContext(fs.readFileSync(require.resolve('../case-notes.js'),'utf8'),ctx);
  return {get,events,intervals,ctx,setTime:n=>now=n,stored:()=>stored,failWrite:v=>writeError=v,click:id=>get(id).listeners.click(),edit(id,value){get(id).value=value;get('noteForm').listeners.input({target:{id,value}})}};
}
test('missing backups warn on startup and configure opens backup options',async()=>{
  const h=harness();await new Promise(setImmediate);
  assert.equal(h.get('backupWarningDialog').open,true);
  assert.match(h.get('backupWarningMessage').textContent,/not configured/);
  h.click('configureBackups');
  assert.equal(h.get('backupWarningDialog').open,false);
  assert.equal(h.get('backupRestoreDialog').open,true);
});
test('dismissed backup warning stays closed for this visit',async()=>{
  const h=harness();await new Promise(setImmediate);
  h.click('dismissBackupWarning');
  await h.intervals.find(i=>i.ms===60000).f();
  assert.equal(h.get('backupWarningDialog').open,false);
});
test('startup warning waits for folder permission and skips connected folders',async()=>{
  for(const permission of ['granted','prompt','denied']) {
    const h=harness({folder:{queryPermission:async()=>permission}});
    await new Promise(setImmediate);
    assert.equal(h.get('backupWarningDialog').open,permission!=='granted');
    if(permission!=='granted')assert.match(h.get('backupWarningMessage').textContent,/permission/);
  }
});
test('backup popup opens and closes without changing notes',async()=>{
  const h=harness();const before=h.stored();
  await h.click('openBackupRestore');
  assert.equal(h.get('backupRestoreDialog').open,true);
  assert.equal(h.get('chooseBackupFolder').textContent,'Set Backup Folder');
  h.click('closeBackupRestore');
  assert.equal(h.get('backupRestoreDialog').open,false);
  assert.equal(h.stored(),before);
});
test('folder control reconnects a saved folder then offers change folder',async()=>{
  let permission='prompt',requests=0;
  const h=harness({folder:{queryPermission:async()=>permission,requestPermission:async()=>{requests++;permission='granted';return permission;}}});
  await new Promise(resolve=>setImmediate(resolve));
  await h.click('openBackupRestore');
  assert.equal(h.get('chooseBackupFolder').textContent,'Reconnect Backup Folder');
  await h.click('chooseBackupFolder');
  assert.equal(requests,1);
  assert.equal(h.get('chooseBackupFolder').textContent,'Change Backup Folder');
});
test('one restore settings entry offers file selection and disables an unconnected folder',()=>{
  const h=harness();const before=h.stored();h.click('restoreSettings');
  assert.equal(h.get('restoreSettingsDialog').open,true);
  assert.equal(h.get('restoreSettingsFromFolder').disabled,true);
  assert.match(h.get('restoreSettingsFolderHint').textContent,/No backup folder connected/);
  h.click('cancelRestoreSettings');assert.equal(h.get('restoreSettingsDialog').open,false);
  assert.equal(h.stored(),before);
  h.click('restoreSettings');h.click('restoreSettingsFromFile');
  assert.equal(h.get('restoreSettingsDialog').open,false);assert.equal(h.get('settingsFile').clickCount,1);
  const html=fs.readFileSync(require.resolve('../case-notes.html'),'utf8');
  assert.equal((html.match(/id="restoreSettings"/g)||[]).length,1);assert.ok(!html.includes('id="importSettings"'));
});
test('restore settings folder choice uses the connected folder and retains error feedback',async()=>{
  let requested;
  const folder={queryPermission:async()=> 'granted',async getFileHandle(name){requested=name;throw Error('Settings backup missing');}};
  const h=harness({folder});await new Promise(setImmediate);h.click('restoreSettings');
  assert.equal(h.get('restoreSettingsFromFolder').disabled,false);
  await h.click('restoreSettingsFromFolder');assert.equal(requested,'customer-config.json');
  assert.equal(h.get('restoreSettingsDialog').open,false);
  assert.match(h.get('backupFolderStatus').textContent,/Settings backup missing/);
});
test('read-only case tabs cannot open restore settings or choose a file',()=>{
  const h=harness({locked:true});h.click('restoreSettings');h.click('restoreSettingsFromFile');
  assert.equal(h.get('restoreSettingsDialog').open,false);assert.equal(h.get('settingsFile').clickCount,0);
});
test('hiding recent cases collapses both workspace layouts and removes individual export controls',()=>{
  const h=harness();h.click('toggleHistory');
  assert.equal(h.get('caseHistory').hidden,true);
  assert.equal(h.get('caseWorkArea').classList.contains('history-collapsed'),true);
  assert.equal(h.get('notesLayout').classList.contains('history-collapsed'),true);
  h.click('toggleHistory');assert.equal(h.get('caseHistory').hidden,false);
  assert.equal(h.get('caseWorkArea').classList.contains('history-collapsed'),false);
  const html=fs.readFileSync(require.resolve('../case-notes.html'),'utf8');
  assert.ok(!html.includes('id="exportCase"'));assert.ok(!html.includes('id="exportCaseJson"'));
  assert.ok(html.includes('id="printCase"'));
});
test('autosave, copying, editing after copy, and save failure recovery',async()=>{
  const h=harness();h.click('newNote');h.edit('notes','Investigation');
  assert.equal(h.get('saveStatus').textContent,'Unsaved changes');
  h.intervals.find(i=>i.ms===10000).f();assert.equal(JSON.parse(h.stored()).cases[0].notes,'Investigation');
  h.setTime(11000);await h.click('copyNote');assert.ok(h.ctx.copied.endsWith('00:00:10'));
  assert.equal(JSON.parse(h.stored()).cases[0].started,null);
  h.setTime(21000);h.edit('next','Follow up');assert.equal(JSON.parse(h.stored()).cases[0].started,21000);
  h.failWrite(true);h.edit('notes','More');h.intervals.find(i=>i.ms===10000).f();assert.match(h.get('saveStatus').textContent,/Save failed/);
  h.failWrite(false);h.click('retrySave');assert.equal(JSON.parse(h.stored()).cases[0].notes,'More');
});
test('clipboard failure leaves timing running; lock blocks second editor',async()=>{
  const h=harness({copyError:true});h.click('newNote');await h.click('copyNote');
  assert.equal(JSON.parse(h.stored()).cases[0].started,1000);assert.match(h.get('copyStatus').textContent,/Could not copy/);
  const second=harness({locked:true});assert.equal(second.get('newNote').disabled,true);assert.equal(second.get('fields').disabled,true);
});
test('older cases gain empty optional fields without losing notes or timing', () => {
  const state=C.empty(), note=C.create(state,'legacy',1000);
  note.request='001234';note.notes='Existing investigation';note.elapsed=9000;
  for(const key of ['os','country','supportType','logLocation'])delete note[key];
  const restored=C.parse(JSON.stringify(state)).cases[0];
  assert.equal(restored.request,'001234');assert.equal(restored.notes,'Existing investigation');
  assert.equal(restored.elapsed,9000);assert.equal(restored.started,1000);
  for(const key of ['os','country','supportType','logLocation'])assert.equal(restored[key],'');
});
test('new case details autosave and are included in Lightning copy',async()=>{
  const h=harness();h.click('newNote');
  const details={request:'001234',os:'Windows Server 2022',country:'United States',supportType:'ProSupport Plus Bring Your own License',logLocation:'https://example.com/logs/123'};
  for(const [key,value] of Object.entries(details))h.edit(key,value);
  h.intervals.find(i=>i.ms===10000).f();
  const restored=C.parse(h.stored()).cases[0];
  for(const [key,value] of Object.entries(details))assert.equal(restored[key],value);
  await h.click('copyNote');
  for(const [key,value] of Object.entries(details))assert.ok(h.ctx.copied.includes(`${C.fields[key]}:\n${value}`));
});
test('OS selection outside the case form autosaves and remains in copied notes',async()=>{
  const h=harness();h.click('newNote');
  h.get('os').value='Windows Server';
  h.get('os').listeners.input({target:{id:'os',value:'Windows Server'}});
  h.intervals.find(i=>i.ms===10000).f();
  assert.equal(C.parse(h.stored()).cases[0].os,'Windows Server');
  await h.click('copyNote');
  assert.match(h.ctx.copied,/OS\/Solution:\nWindows Server/);
});
test('Copy to AI creates a bounded prompt without stopping time tracking',async()=>{
  const h=harness();h.click('newNote');h.edit('issue','Unexpected service restart');h.get('devinTask').value='troubleshoot';
  await h.click('copyDevin');
  assert.match(h.ctx.copied,/Task: Suggest next troubleshooting/);
  assert.match(h.ctx.copied,/Unexpected service restart/);
  assert.match(h.ctx.copied,/untrusted case data/);
  assert.equal(C.parse(h.stored()).cases[0].started,1000);
});
test('escalation handoff maps note fields and preserves every detail without stopping time', () => {
  const state=C.empty(), note=C.create(state,'handoff',1000);
  Object.assign(note,{tag:'TEST123',request:'000123',os:'Ubuntu',country:'US',supportType:'OEM',logLocation:'https://example.com/log',issue:'Issue details',notes:'Investigation\nResults',next:'Review diagnostics'});
  const payload=C.escalation(note,11000);
  assert.equal(payload.problem,note.issue);assert.equal(payload.troubleshooting,note.notes);assert.equal(payload.nextSteps,note.next);
  for(const field of ['tag','os','country'])assert.equal(payload[field],note[field]);
  for(const value of Object.values(C.fields).map((label)=>label+':\n'))assert.ok(payload.sourceNote.includes(value));
  assert.ok(payload.sourceNote.includes('000123'));assert.ok(payload.sourceNote.includes('https://example.com/log'));assert.ok(payload.sourceNote.endsWith('00:00:10'));
  assert.equal(note.started,1000);
});
test('OS/Solution dropdown options match on both pages', () => {
  const options=file=>fs.readFileSync(require.resolve('../'+file),'utf8').match(/<select id="os"[^>]*>(.*?)<\/select>/s)[1];
  assert.equal(options('case-notes.html'),options('escalation-quality.html'));
});
test('manual stop saves elapsed time and disables the button until editing resumes', () => {
  const h=harness();h.click('newNote');h.setTime(6000);h.click('stopTimer');
  let note=C.parse(h.stored()).cases[0];
  assert.equal(note.elapsed,5000);assert.equal(note.started,null);
  assert.equal(h.get('stopTimer').disabled,true);
  h.setTime(16000);h.click('stopTimer');
  assert.equal(C.parse(h.stored()).cases[0].elapsed,5000);
  h.edit('notes','Continue investigation');
  note=C.parse(h.stored()).cases[0];
  assert.equal(note.started,16000);assert.equal(note.elapsed,5000);
  assert.equal(h.get('stopTimer').disabled,false);
});
test('stopping the timer keeps the just-finished session duration visible until a new session starts', () => {
  const state=C.empty(),note=C.create(state,'session',1000);
  assert.equal(C.lastSession(note,4000),3000);
  C.stop(note,6000);
  assert.equal(note.lastSession,5000);
  assert.equal(C.lastSession(note,6000),5000);
  assert.equal(C.lastSession(note,60000),5000);
  C.start(state,note,66000);
  assert.equal(C.lastSession(note,66000),0);
  assert.equal(C.lastSession(note,70000),4000);
  assert.equal(note.lastSession,5000);
  const restored=C.parse(C.backup(state,80000)).cases[0];
  assert.equal(restored.lastSession,14000);
});
test('older saved cases without session tracking migrate to a zero last session', () => {
  const state=C.empty(),note=C.create(state,'legacy-session',1000);
  delete note.lastSession;
  const restored=C.parse(JSON.stringify(state)).cases[0];
  assert.equal(restored.lastSession,0);
});
test('backup freezes elapsed time without changing live history and restores all case fields', () => {
  const state=C.empty(), note=C.create(state,'backup',1000);
  note.notes='Unsaved notes\nSecond line';note.os='Ubuntu';note.logLocation='https://example.com/log';
  const restored=C.parse(C.backup(state,11000));
  assert.equal(note.started,1000);assert.equal(note.elapsed,0);
  assert.equal(restored.cases[0].started,null);assert.equal(restored.cases[0].elapsed,10000);
  assert.equal(restored.cases[0].notes,note.notes);assert.equal(restored.cases[0].logLocation,note.logLocation);
  assert.equal(C.elapsed(restored.cases[0],9999999),10000);
  assert.equal(restored.selected,'backup');
});
test('imported inherited-property IDs can open empty version history',async()=>{
  const h=harness(),s=C.empty();C.create(s,'toString',1);
  h.get('restoreFile').files=[{text:async()=>C.backup(s,2)}];await h.get('restoreFile').listeners.change();
  h.click('caseVersions');assert.match(h.get('caseRecoveryStatus').textContent,/No earlier versions/);
});
test('copy actions preserve canonical screenshot references instead of rendered image payloads',async()=>{
  const h=harness();const s=C.empty();const n=C.create(s,'image-case',1);
  n.notes='<p>QA screenshot</p><img src="attachment:qa-image" alt="QA">';
  n.images={'qa-image':{name:'QA',data:'data:image/png;base64,AAAA'}};
  h.get('restoreFile').files=[{text:async()=>C.backup(s,2)}];await h.get('restoreFile').listeners.change();
  h.get('notesRich').innerHTML='<p>QA screenshot</p><img src="data:image/png;base64,AAAA" alt="QA">';
  await h.click('copyNote');
  assert.equal(C.parse(h.stored()).cases[0].notes,n.notes);
  await h.click('copyDevin');
  assert.match(h.ctx.copied,/QA screenshot/);
  assert.equal(C.parse(h.stored()).cases[0].notes,n.notes);
});
test('restore replaces history only after valid input, confirmation, and successful storage', async () => {
  const h=harness();h.click('newNote');h.edit('notes','Keep me');
  const original=h.stored();
  const upload=async text=>{h.get('restoreFile').files=[{text:async()=>text}];await h.get('restoreFile').listeners.change()};
  await upload('{broken');assert.equal(h.stored(),original);
  assert.match(h.get('backupStatus').textContent,/Invalid/);
  const state=C.empty();const note=C.create(state,'restored',1000);note.notes='Backup notes';
  const backup=C.backup(state,7000);
  h.ctx.confirm=()=>false;await upload(backup);assert.equal(h.stored(),original);
  h.ctx.confirm=()=>true;h.failWrite(true);await upload(backup);
  assert.equal(h.stored(),original);assert.match(h.get('backupStatus').textContent,/could not be saved/);
  h.failWrite(false);await upload(backup);
  const result=C.parse(h.stored());assert.equal(result.selected,'restored');
  assert.equal(result.cases[0].notes,'Backup notes');assert.equal(result.cases[0].elapsed,6000);
  assert.equal(result.cases[0].started,null);
});
test('deletion requires confirmation, preserves data on failure, and selects remaining case', () => {
  const h=harness();h.click('newNote');h.edit('notes','First');h.setTime(2000);h.click('newNote');
  const remove=()=>h.get('historyList').children[0].children[1].listeners.click();
  h.ctx.confirm=()=>false;remove();assert.equal(C.parse(h.stored()).cases.length,2);
  h.ctx.confirm=()=>true;h.failWrite(true);remove();assert.equal(C.parse(h.stored()).cases.length,2);
  h.failWrite(false);remove();let state=C.parse(h.stored());
  assert.equal(state.cases.length,1);assert.equal(state.selected,'1000');assert.equal(state.cases[0].notes,'First');assert.equal(state.cases[0].started,null);
  remove();state=C.parse(h.stored());assert.equal(state.cases.length,0);assert.equal(state.selected,null);assert.equal(h.get('welcome').hidden,false);
});
test('screenshots survive backup and restore while text exports contain labels only', () => {
  const state=C.empty(),note=C.create(state,'screenshots',1000);
  note.images={'image-1':{name:'Screenshot',data:'data:image/png;base64,aGVsbG8='}};
  note.notes='## Investigation\n**Failed**\n![Screenshot](attachment:image-1)';
  note.next='- Collect logs';
  const restored=C.parse(C.backup(state,2000)).cases[0];
  assert.deepEqual(restored.images,note.images);assert.equal(restored.notes,note.notes);
  const text=C.copyText(note,2000);
  assert.ok(text.includes('[Screenshot: Screenshot; view in Case Notes]'));
  assert.ok(!text.includes('attachment:'));assert.ok(!text.includes('base64'));
  assert.ok(!C.escalation(note,2000).troubleshooting.includes('attachment:'));
  note.images['image-1'].data='data:image/svg+xml;base64,aGVsbG8=';
  assert.throws(()=>C.parse(JSON.stringify(state)),/Invalid screenshots/);
});
test('HTML email contains inline MIME images and plain text alternative with safe Unicode subject', () => {
  const state=C.empty(),note=C.create(state,'mail',1000);
  note.request='123\r\nBcc: test';note.notes='**Café**';
  const content={html:'<p><strong>Café</strong></p><img src="cid:img-1@case-notes">',images:{'img-1':{data:'data:image/png;base64,aGVsbG8='}}};
  const eml=C.emailFile(note,11000,content,'test-id');
  assert.ok(eml.includes('X-Unsent: 1\r\n'));assert.ok(eml.includes('multipart/alternative'));
  assert.ok(eml.includes('Content-ID: <img-1@case-notes>'));assert.ok(eml.includes('Content-Disposition: inline;'));
  assert.ok(eml.includes(Buffer.from(content.html).toString('base64').slice(0,76)));
  assert.ok(!eml.includes('\r\nBcc:'));assert.equal(note.started,1000);
});
test('rich text copies and escalates as readable plain text while backup preserves HTML', () => {
  const state=C.empty(),note=C.create(state,'rich',1000);
  note.notes='<p><strong>Failure &amp; recovery</strong></p><ul><li>Collect logs</li><li>Retest</li></ul><img src="attachment:img-1" alt="Error screenshot">';
  note.next='<p>Contact customer</p>';
  const text=C.copyText(note,2000);
  assert.ok(text.includes('Failure & recovery'));assert.ok(text.includes('- Collect logs'));
  assert.ok(text.includes('[Screenshot: Error screenshot; view in Case Notes]'));assert.ok(!text.includes('<p>'));
  assert.equal(C.escalation(note,2000).nextSteps,'Contact customer');
  assert.equal(C.parse(C.backup(state,2000)).cases[0].notes,note.notes);
});

test('OS version/build survives backup, exports, handoff, and legacy history migration',()=>{
 const state=C.empty(),note=C.create(state,'os-build',100);note.osVersion='Windows Server 2022 build 20348';
 const restored=C.parse(C.backup(state,200));assert.equal(restored.cases[0].osVersion,note.osVersion);
 assert.match(C.copyText(note,200),/OS version \/ build:\nWindows Server 2022 build 20348/);
 assert.equal(C.escalation(note,200).osVersion,note.osVersion);
 delete note.osVersion;assert.equal(C.parse(JSON.stringify(state)).cases[0].osVersion,'');
});
