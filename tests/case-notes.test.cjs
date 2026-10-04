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
  assert.equal(files.size,4);assert.equal(requests,0);
  assert.ok([...files].some(([name,body])=>/^case-history-\d{4}-\d{2}-\d{2}_\d{6}\.json$/.test(name)&&JSON.parse(body).cases[0].notes==='Backup test'));
  assert.equal(JSON.parse(files.get('case-history.json')).cases[0].notes,'Backup test');
  assert.ok([...files.keys()].some(name=>/^customer-config-\d{4}-\d{2}-\d{2}_\d{6}\.json$/.test(name)));
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
function harness({writeError=false,copyError=false,locked=false,folder=null,aiIntegration=false,initial=null,hash=''}={}) {
  const elements={}, intervals=[], events={};let stored=initial, now=1000;
  const preferences = new Map();
  function element(){
    const classes = new Set();
    const el={
      options:[],_children:[],dataset:{},style:{setProperty(){},removeProperty(){}},
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
      classList:{toggle(name,enabled){if(enabled ?? !classes.has(name))classes.add(name);else classes.delete(name);},contains(name){return classes.has(name);}},listeners:{},attributes:{},setAttribute(k,v){this.attributes[k]=v;},
      append(...items){for(const item of items)this._children.push(item)},
      appendChild(item){this._children.push(item);return item},
      replaceChildren(...items){this._children=items},
      addEventListener(k,f){this.listeners[k]=f},focus(){this.focused=true;},contains(item){return item===this||this._children.includes(item);}
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
  const ctx={confirm:()=>true,CaseNotes:C,DevinPrompt:require('../devin-prompt-core.js'),document:{getElementById:get,createElement:element,createElementNS:element,addEventListener(k,f){const previous=events[k];events[k]=event=>{previous?.(event);return f(event);};}},window:{addEventListener(k,f){events[k]=f}},localStorage:{getItem:()=>stored,setItem(k,v){if(writeError)throw Error('full');stored=v}},navigator:{locks:{request(k,f){if(!locked)return f();return new Promise(()=>{})}},clipboard:{async writeText(text){if(copyError)throw Error('denied');ctx.copied=text}}},crypto:{randomUUID:()=>String(now)},Date:class extends Date{static now(){return now}},setInterval(f,ms){intervals.push({f,ms})},Promise,console};
  ctx.CaseSettings = require('../case-settings-core.js');
  ctx.CaseBackup = require('../case-backup-core.js');
  ctx.CaseExample = require('../case-example-core.js');
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
  ctx.window.SiteTopbar={closed:0,closeMenus(){this.closed++;}};
  if(hash){ctx.window.location={hash,pathname:'/case-notes.html',search:''};ctx.window.history={replaceState(){ctx.window.location.hash='';}};}
  if(aiIntegration){ctx.window.DevinConnection={createClient:()=>({})};ctx.window.DevinIntegration={init(api){ctx.ai=api;return {refresh(){}};}};}
  vm.runInNewContext(fs.readFileSync(require.resolve('../case-notes.js'),'utf8'),ctx);
  return {get,events,intervals,ctx,setTime:n=>now=n,stored:()=>stored,failWrite:v=>writeError=v,click:id=>get(id).listeners.click(),edit(id,value){get(id).value=value;get('noteForm').listeners.input({target:{id,value}})}};
}
test('missing backups show an inline banner on startup and configure opens backup options',async()=>{
  const h=harness();h.get('backupWarningBanner').hidden=true;await new Promise(setImmediate);
  assert.equal(h.get('backupWarningBanner').hidden,false);
  assert.match(h.get('backupWarningMessage').textContent,/not configured/);
  assert.match(h.get('backupWarningMessage').textContent,/reset your browser or delete browser data, all of this app's settings and notes history will be lost/);
  h.click('configureBackups');
  assert.equal(h.get('backupWarningBanner').hidden,true);
  assert.equal(h.get('backupRestoreMenu').open,true);
  const html=fs.readFileSync(require.resolve('../case-notes.html'),'utf8');
  assert.ok(!html.includes('id="backupWarningDialog"'),'the modal nag is gone');assert.ok(html.includes('id="backupWarningBanner"'));
});
test('Customize Fields opens the customizer from the shared Settings menu without changing case data',()=>{
  const h=harness();const before=h.stored();
  h.click('customizeFields');assert.equal(h.get('fieldCustomizer').open,true);
  assert.equal(h.ctx.window.SiteTopbar.closed,1,'the shared Settings menu is closed');assert.equal(h.stored(),before);
});
test('dismissed backup warning snoozes for a week across visits',async()=>{
  const h=harness();h.get('backupWarningBanner').hidden=true;await new Promise(setImmediate);
  assert.equal(h.get('backupWarningBanner').hidden,false);
  h.click('dismissBackupWarning');
  h.click('confirmBackupSnooze');
  await h.intervals.find(i=>i.ms===60000).f();
  assert.equal(h.get('backupWarningBanner').hidden,true);
  const snoozed=Number(h.ctx.localStorage.getItem('dell-support.backup-warning-snoozed-until'));
  assert.equal(snoozed,1000+7*86400000);
  const again=harness();again.get('backupWarningBanner').hidden=true;
  again.ctx.localStorage.setItem('dell-support.backup-warning-snoozed-until',String(snoozed));
  await new Promise(setImmediate);assert.equal(again.get('backupWarningBanner').hidden,true);
  const later=harness();later.get('backupWarningBanner').hidden=true;later.setTime(snoozed+1);
  later.ctx.localStorage.setItem('dell-support.backup-warning-snoozed-until',String(snoozed));
  await new Promise(setImmediate);assert.equal(later.get('backupWarningBanner').hidden,false);
});
test('Load Example adds a separate sample case with three dated notes and keeps the current case',()=>{
  const h=harness();h.setTime(Date.parse('2026-10-04T15:00:00'));h.click('newNote');h.edit('tag','MINE123');
  const mine=JSON.parse(h.stored()).selected;
  h.click('loadExampleNote');
  let saved=JSON.parse(h.stored());
  assert.equal(saved.selected,h.ctx.CaseExample.ID);
  assert.equal(saved.cases.find(n=>n.id===mine).tag,'MINE123','your own case is unchanged');
  const sample=saved.cases.find(n=>n.id===h.ctx.CaseExample.ID);
  assert.equal(sample.entries.length,3);assert.equal(new Set(sample.entries.map(e=>new Date(e.created).toDateString())).size,3);
  assert.match(h.get('copyStatus').textContent,/Sample case loaded/);
  let asked=0;h.ctx.confirm=()=>{asked++;return false;};h.click('loadExampleNote');
  assert.equal(asked,1,'reloading asks before resetting the sample');
  assert.equal(JSON.parse(h.stored()).cases.filter(n=>n.id===h.ctx.CaseExample.ID).length,1,'never duplicated');
});
test('the tour opens the sample case and returns to the case that was open',()=>{
  const h=harness();h.setTime(Date.parse('2026-10-04T15:00:00'));h.click('newNote');const mine=JSON.parse(h.stored()).selected;
  const previous=h.ctx.window.CaseNotesExample.open();
  assert.equal(previous,mine);assert.equal(JSON.parse(h.stored()).selected,h.ctx.CaseExample.ID);
  h.ctx.window.CaseNotesExample.restore(previous);
  assert.equal(JSON.parse(h.stored()).selected,mine);
  let asked=0;h.ctx.confirm=()=>{asked++;return true;};
  h.ctx.window.CaseNotesExample.open();assert.equal(asked,0,'an existing sample is reused without prompting');
  assert.equal(JSON.parse(h.stored()).cases.filter(n=>n.id===h.ctx.CaseExample.ID).length,1);
});
test('Remind me in a week warns about data loss before snoozing',async()=>{
  const h=harness();h.get('backupWarningBanner').hidden=true;await new Promise(setImmediate);
  h.click('dismissBackupWarning');
  assert.equal(h.get('backupSnoozeDialog').open,true,'snoozing asks for confirmation first');
  assert.equal(h.ctx.localStorage.getItem('dell-support.backup-warning-snoozed-until'),null);
  const html=fs.readFileSync(require.resolve('../case-notes.html'),'utf8');
  assert.match(html,/id="backupSnoozeHelp"[^>]*><strong>If you reset your browser or delete browser data, all of this app's settings and notes history will be lost\./);
  h.click('cancelBackupSnooze');
  assert.equal(h.get('backupSnoozeDialog').open,false);
  assert.equal(h.get('backupWarningBanner').hidden,false,'cancel keeps the banner');
  assert.equal(h.ctx.localStorage.getItem('dell-support.backup-warning-snoozed-until'),null);
  h.click('dismissBackupWarning');h.click('snoozeConfigureBackups');
  assert.equal(h.get('backupSnoozeDialog').open,false);
  assert.equal(h.get('backupRestoreMenu').open,true,'configure from the warning opens Backup & Restore');
  assert.equal(h.ctx.localStorage.getItem('dell-support.backup-warning-snoozed-until'),null);
});
test('startup warning waits for folder permission and skips connected folders',async()=>{
  for(const permission of ['granted','prompt','denied']) {
    const h=harness({folder:{queryPermission:async()=>permission}});h.get('backupWarningBanner').hidden=true;
    await new Promise(setImmediate);
    assert.equal(h.get('backupWarningBanner').hidden,permission==='granted');
    if(permission!=='granted')assert.match(h.get('backupWarningMessage').textContent,/permission/);
  }
});
test('a saved folder that needs permission asks on the next click outside the backup menu',async()=>{
  let permission='prompt',requests=0;const files=new Map();
  const folder={queryPermission:async()=>permission,requestPermission:async()=>{requests++;permission='granted';return permission;},async getFileHandle(name){return {async createWritable(){return {async write(value){files.set(name,value);},async close(){}};}};}};
  const h=harness({folder});await new Promise(setImmediate);h.click('newNote');
  await h.events.click({target:{}});await new Promise(setImmediate);
  assert.equal(requests,1);assert.ok(files.has('case-history.json'),'reconnecting triggers a backup');
  assert.equal(h.get('backupWarningBanner').hidden,true);
  await h.events.click({target:{}});assert.equal(requests,1,'only the first click asks');
  const menuClick=harness({folder:{queryPermission:async()=>'prompt',requestPermission:async()=>{throw Error('should not be asked from inside the menu');}}});
  await new Promise(setImmediate);const inMenu={};menuClick.get('backupRestoreMenu').append(inMenu);
  await menuClick.events.click({target:inMenu});
});
test('Backup & Restore opens a dialog from the shared Settings menu without changing notes',async()=>{
  const h=harness();const before=h.stored();
  await h.click('openBackupRestore');
  assert.equal(h.ctx.window.SiteTopbar.closed,1,'settings menu closes when the dialog opens');
  assert.equal(h.get('backupRestoreMenu').open,true);
  assert.equal(h.get('chooseBackupFolder').textContent,'Set Backup Folder');
  h.click('closeBackupRestore');
  assert.equal(h.get('backupRestoreMenu').open,false);
  assert.equal(h.stored(),before);
  const html=fs.readFileSync(require.resolve('../case-notes.html'),'utf8');
  assert.match(html,/<dialog id="backupRestoreMenu"/);
});
test('links from other pages open Backup & Restore or Customize Fields in Case Notes',async()=>{
  for(const [hash,dialog] of [['#backup-restore','backupRestoreMenu'],['#customize-fields','fieldCustomizer']]){
    const h=harness({hash});await new Promise(setImmediate);
    assert.equal(h.get(dialog).open,true,hash);
    assert.equal(h.ctx.window.location.hash,'','the link is consumed so a reload does not reopen it');
  }
  const plain=harness();await new Promise(setImmediate);
  assert.equal(plain.get('backupRestoreMenu').open,false);assert.equal(plain.get('fieldCustomizer').open,false);
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
test('Devin snapshot captures selected task and latest fields without stopping timer',()=>{
  const h=harness({aiIntegration:true});h.click('newNote');h.edit('issue','CLI review');h.get('devinTask').value='troubleshoot';
  assert.ok(h.ctx.ai);const snapshot=h.ctx.ai.snapshot();assert.equal(snapshot.caseId,'1000');
  assert.match(snapshot.prompt,/CLI review/);assert.match(snapshot.prompt,/Task: Suggest next troubleshooting/);
  assert.equal(C.parse(h.stored()).cases[0].started,1000);
});
test('Devin append protects source case and escapes response while preserving latest edits',()=>{
  const h=harness({aiIntegration:true});h.click('newNote');const id=h.ctx.ai.snapshot().caseId;
  h.edit('notes','Latest edits');assert.equal(h.ctx.ai.appendResponse(id,'<script>evil()</script>\nSuggestion'),true);
  const note=C.parse(h.stored()).cases[0];assert.match(note.notes,/Latest edits/);assert.match(note.notes,/&lt;script&gt;evil\(\)&lt;\/script&gt;/);assert.ok(!note.notes.includes('<script>'));
  h.setTime(2000);h.click('newNote');assert.equal(h.ctx.ai.canAppend(id),false);assert.equal(h.ctx.ai.appendResponse(id,'Wrong case'),false);
  assert.ok(!C.parse(h.stored()).cases[0].notes.includes('Wrong case'));
  const locked=harness({locked:true,aiIntegration:true});assert.equal(locked.ctx.ai.snapshot(),null);assert.equal(locked.ctx.ai.appendResponse(id,'No'),false);
});
test('deleting the original case prevents later Devin append',()=>{
  const h=harness({aiIntegration:true});h.click('newNote');const id=h.ctx.ai.snapshot().caseId;
  h.get('historyList').children[0].children[1].listeners.click();
  assert.equal(C.parse(h.stored()).cases.length,0);assert.equal(h.ctx.ai.canAppend(id),false);
  assert.equal(h.ctx.ai.appendResponse(id,'Deleted case reply'),false);
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

test('dated entry tabs preserve each day and keep a single case through summary and reload',()=>{
 const h=harness();h.click('newNote');h.edit('notes','First investigation');h.edit('next','Collect logs');
 h.setTime(86401000);assert.equal(typeof h.get('newCaseEntry').listeners.click,'function');h.click('newCaseEntry');
 let saved=C.parse(h.stored());assert.equal(saved.cases.length,1);assert.equal(saved.cases[0].entries.length,2);
 h.edit('notes','Follow-up investigation');h.edit('next','Review logs');
 const tabs=()=>h.get('caseEntryTabs').children;
 tabs()[1].listeners.click();assert.equal(h.get('notes').value,'First investigation');assert.equal(h.get('next').value,'Collect logs');
 tabs()[0].listeners.click();assert.equal(h.get('caseSummaryPanel').hidden,false);assert.equal(h.get('notesSectionBody').hidden,true);
 tabs()[2].listeners.click();assert.equal(h.get('notes').value,'Follow-up investigation');assert.equal(h.get('caseSummaryPanel').hidden,true);
 saved=C.parse(h.stored());assert.equal(saved.cases[0].entries[1].next,'Review logs');
});
test('failed saves block entry creation and switching without discarding edits',()=>{
 const h=harness();h.click('newNote');h.edit('notes','Must retain');h.failWrite(true);
 assert.equal(typeof h.get('newCaseEntry').listeners.click,'function');h.click('newCaseEntry');
 assert.equal(h.get('notes').value,'Must retain');assert.equal(C.parse(h.stored()).cases[0].entries.length,1);
 h.failWrite(false);h.setTime(2000);h.click('newCaseEntry');assert.equal(C.parse(h.stored()).cases[0].entries[0].notes,'Must retain');
});
test('AI results cannot append to a different dated entry in the same case',()=>{
 const h=harness({aiIntegration:true});h.click('newNote');const source=h.ctx.ai.snapshot();
 assert.equal(typeof source.entryId,'string');h.setTime(2000);h.click('newCaseEntry');
 assert.equal(h.ctx.ai.canAppend(source.caseId,source.entryId),false);
 assert.equal(h.ctx.ai.appendResponse(source.caseId,'Wrong entry',source.entryId),false);
 h.get('caseEntryTabs').children[1].listeners.click();
 assert.equal(h.ctx.ai.canAppend(source.caseId,source.entryId),true);
});

test('read-only tabs can browse every dated entry and summary without writing storage',()=>{
 const state=C.empty(),note=C.create(state,'readonly',1000);note.notes='Earlier day';C.addEntry(note,'second',2000);note.notes='Later day';C.syncEntry(note);
 const initial=JSON.stringify(state),h=harness({locked:true,initial});
 const tabs=()=>h.get('caseEntryTabs').children;
 assert.equal(tabs()[1].disabled,false);tabs()[1].listeners.click();assert.equal(h.get('notes').value,'Earlier day');
 tabs()[0].listeners.click();assert.equal(h.get('caseSummaryPanel').hidden,false);
 tabs()[2].listeners.click();assert.equal(h.get('notes').value,'Later day');
 assert.equal(h.stored(),initial);assert.equal(h.get('fields').disabled,true);assert.equal(h.get('newCaseEntry').disabled,true);
});

// Backup folder with real listing, nested images directory, and deletes, mirroring the File System Access API.
function fakeFolder(permission='granted'){
  const files=new Map(),dirs=new Map();
  const folder={
    files,dirs,requests:0,removed:[],
    queryPermission:async()=>permission,
    requestPermission:async()=>{folder.requests++;permission='granted';return permission;},
    async getFileHandle(name,options){
      if(!files.has(name)){if(!options?.create){const e=Error('not found');e.name='NotFoundError';throw e;}files.set(name,'');}
      return {kind:'file',name,async getFile(){const body=files.get(name);return {size:typeof body==='string'?body.length:body.byteLength,lastModified:5,async text(){return String(body);},async arrayBuffer(){return body.buffer.slice(body.byteOffset,body.byteOffset+body.byteLength);}};},
        async createWritable(){return {async write(value){files.set(name,value);},async close(){},async abort(){}};}};
    },
    async getDirectoryHandle(name,options){
      if(!dirs.has(name)){if(!options?.create){const e=Error('not found');e.name='NotFoundError';throw e;}dirs.set(name,fakeFolder('granted'));}
      return dirs.get(name);
    },
    async removeEntry(name){if(!files.has(name))throw Error('missing '+name);files.delete(name);folder.removed.push(name);},
    async *entries(){for(const name of files.keys())yield [name,{kind:'file',getFile:()=>folder.getFileHandle(name).then(h=>h.getFile())}];for(const name of dirs.keys())yield [name,{kind:'directory'}];}
  };
  return folder;
}
const B=require('../case-backup-core.js');
const HOUR=3600000,DAY=86400000;
test('automatic backups refresh the latest file every run but add a dated snapshot only once per hour',async()=>{
  const folder=fakeFolder();const h=harness({folder});await new Promise(setImmediate);
  const start=new Date(2026,9,3,9,0,0).getTime();h.setTime(start);
  h.click('newNote');h.edit('notes','First');const backup=h.intervals.find(i=>i.ms===60000).f;await backup();
  const dated=()=>[...folder.files.keys()].filter(n=>/^case-history-\d{4}/.test(n));
  const datedSettings=()=>[...folder.files.keys()].filter(n=>/^customer-config-\d{4}/.test(n));
  assert.equal(dated().length,1);assert.equal(datedSettings().length,1);
  assert.equal(dated()[0],'case-history-2026-10-03_090000.json');
  h.setTime(start+5*60000);h.edit('notes','Second');await backup();
  assert.equal(dated().length,1,'no new dated snapshot within the hour');
  assert.equal(datedSettings().length,1,'settings did not change, so no dated settings copy');
  assert.match(folder.files.get('case-history.json'),/Second/);
  h.setTime(start+HOUR);h.edit('notes','Third');await backup();
  assert.deepEqual(dated().sort(),['case-history-2026-10-03_090000.json','case-history-2026-10-03_100000.json']);
  assert.equal(h.ctx.localStorage.getItem('dell-support.last-dated-backup-at'),new Date(start+HOUR).toISOString());
  h.ctx.localStorage.setItem('theme','dark');h.setTime(start+HOUR+60000);h.edit('notes','Fourth');await backup();
  assert.equal(datedSettings().length,2,'a settings change adds a dated settings copy');
  assert.equal(dated().length,2);
});
test('screenshots are written once to images/ and snapshots reference them instead of embedding base64',async()=>{
  const folder=fakeFolder();const h=harness({folder});await new Promise(setImmediate);
  const s=C.empty();const a=C.create(s,'a',1);a.images={x:{name:'X',data:'data:image/png;base64,aGVsbG8='},y:{name:'Y',data:'data:image/png;base64,aGVsbG8='}};
  h.setTime(2);const b=C.create(s,'b',2);b.images={z:{name:'Z',data:'data:image/jpeg;base64,d29ybGQ='}};
  h.get('restoreFile').files=[{text:async()=>C.backup(s,3)}];await h.get('restoreFile').listeners.change();
  await h.click('backupHistory');
  const images=folder.dirs.get('images');assert.ok(images,'images directory created');
  assert.equal(images.files.size,2,'identical screenshots stored once');
  for(const [name,bytes] of images.files){assert.match(name,/^[a-f0-9]{64}\.(png|jpg)$/);assert.ok(bytes instanceof Uint8Array);}
  const latest=folder.files.get('case-history.json');
  assert.ok(!latest.includes('base64,'),'no embedded screenshot data');
  assert.match(latest,/"file": "images\/[a-f0-9]{64}\.png"/);
  const manual=[...folder.files.keys()].find(n=>n.startsWith('case-history-manual-'));assert.ok(manual);
  assert.match(h.get('backupStatus').textContent,/Backup saved to ProSupportToolsBackup/);
  const writesBefore=images.files.size;await h.click('backupHistory');assert.equal(images.files.size,writesBefore,'existing image files are not rewritten');
});
test('Restore History lists folder snapshots newest first, saves a safety copy, and restores screenshots from images/',async()=>{
  const folder=fakeFolder();const h=harness({folder});await new Promise(setImmediate);
  const now=new Date(2026,9,3,12,0,0).getTime();h.setTime(now);
  const s=C.empty();const a=C.create(s,'shots',now-DAY);a.notes='Older notes';a.images={x:{name:'X',data:'data:image/png;base64,aGVsbG8='}};
  h.get('restoreFile').files=[{text:async()=>C.backup(s,now)}];await h.get('restoreFile').listeners.change();
  await h.click('backupHistory');
  const manualName=[...folder.files.keys()].find(n=>n.startsWith('case-history-manual-'));
  folder.files.set('case-history-2026-10-01_080000.json',folder.files.get(manualName));
  folder.files.set('case-history-2025-01-01T10-00-00-000Z.json','{"legacy":true}');folder.files.set('notes.txt','ignore me');
  h.setTime(now+60000);h.edit('notes','Current work');h.intervals.find(i=>i.ms===10000).f();
  h.click('restoreHistory');assert.equal(h.get('restoreHistoryDialog').open,true);assert.equal(h.get('restoreHistoryFromFolder').disabled,false);
  await h.click('restoreHistoryFromFolder');assert.equal(h.get('restoreHistoryDialog').open,false);assert.equal(h.get('backupBrowserDialog').open,true);
  const entries=h.get('backupBrowserList').children;
  // The file-picker restore above already saved a safety copy because a folder is connected.
  const firstSafety=[...folder.files.keys()].find(n=>n.startsWith('case-history-before-restore-'));
  assert.deepEqual(entries.map(e=>e.dataset.name),['case-history.json',firstSafety,manualName,'case-history-2026-10-01_080000.json','case-history-2025-01-01T10-00-00-000Z.json']);
  assert.match(entries[1].textContent,/Safety copy before restore/);assert.match(entries[2].textContent,/Manual/);assert.match(entries[3].textContent,/Hourly/);assert.match(h.get('backupBrowserStatus').textContent,/5 snapshots/);
  folder.files.delete(firstSafety);
  await entries[2].listeners.click();await new Promise(setImmediate);
  assert.equal(h.get('backupBrowserDialog').open,false);
  const restored=C.parse(h.stored());assert.equal(restored.cases[0].notes,'Older notes');
  assert.equal(restored.cases[0].images.x.data,'data:image/png;base64,aGVsbG8=');
  const safety=[...folder.files.keys()].find(n=>n.startsWith('case-history-before-restore-'));assert.ok(safety,'safety copy written before restore');
  assert.match(folder.files.get(safety),/Current work/);
  assert.match(h.get('backupStatus').textContent,/Restored 1 cases/);
});
test('restoring a folder-style backup from a file without its images folder explains what to do and changes nothing',async()=>{
  const h=harness();h.click('newNote');h.edit('notes','Keep me');const before=h.stored();
  const external={...C.empty(),cases:[{...C.create(C.empty(),'ext',1),images:{x:{name:'X',file:'images/'+'a'.repeat(64)+'.png'}}}]};
  h.get('restoreFile').files=[{text:async()=>JSON.stringify(external)}];await h.get('restoreFile').listeners.change();
  assert.equal(h.stored(),before);assert.match(h.get('backupStatus').textContent,/images subfolder/);
  const folder=fakeFolder();const withFolder=harness({folder});await new Promise(setImmediate);withFolder.click('newNote');const kept=withFolder.stored();
  withFolder.get('restoreFile').files=[{text:async()=>JSON.stringify(external)}];await withFolder.get('restoreFile').listeners.change();
  assert.equal(withFolder.stored(),kept);assert.match(withFolder.get('backupStatus').textContent,/missing from the backup folder/);
});
test('Clean Up Old Snapshots previews, removes only automatic snapshots per retention, sweeps unused images, and enables automatic cleanup',async()=>{
  const folder=fakeFolder();const h=harness({folder});await new Promise(setImmediate);
  const now=new Date(2026,9,3,12,0,0).getTime();h.setTime(now);
  const s=C.empty();const a=C.create(s,'shots',now-DAY);a.images={x:{name:'X',data:'data:image/png;base64,aGVsbG8='}};
  h.get('restoreFile').files=[{text:async()=>C.backup(s,now)}];await h.get('restoreFile').listeners.change();
  await h.click('backupHistory');
  const usedImage=[...folder.dirs.get('images').files.keys()][0];
  folder.dirs.get('images').files.set('b'.repeat(64)+'.png',new Uint8Array([1]));folder.dirs.get('images').files.set('README.txt','keep');
  for(let d=1;d<=60;d++)folder.files.set(B.fileName('history','auto',now-d*DAY-HOUR),'{"old":true}');
  for(let i=0;i<50;i++)folder.files.set(`case-history-2026-08-0${1+(i%9)}T${String(i%24).padStart(2,'0')}-00-00-000Z.json`,'x'.repeat(100));
  folder.files.set(B.fileName('history','safety',now-500*DAY,'restore'),'{}');folder.files.set('notes.txt','mine');
  const total=folder.files.size;
  let confirmText='';h.ctx.confirm=text=>{confirmText=text;return false;};
  await h.click('cleanupBackups');
  assert.match(confirmText,/Remove \d+ older automatic snapshots/);assert.match(confirmText,/manual backups and safety copies/);
  assert.equal(folder.files.size,total,'declining removes nothing');assert.equal(h.ctx.localStorage.getItem('dell-support.backup-cleanup-enabled'),null);
  h.ctx.confirm=()=>true;await h.click('cleanupBackups');
  const remaining=[...folder.files.keys()];
  assert.ok(remaining.includes('case-history.json'));assert.ok(remaining.includes('customer-config.json'));assert.ok(remaining.includes('notes.txt'));
  assert.ok(remaining.some(n=>n.startsWith('case-history-manual-')));assert.ok(remaining.some(n=>n.startsWith('case-history-before-restore-')));
  const autos=remaining.map(B.parseFileName).filter(i=>i&&i.kind==='auto'&&i.type==='history');
  assert.ok(autos.every(i=>now-i.time<30*DAY),'nothing older than 30 days remains');
  assert.ok(autos.length>=29&&autos.length<=31,'one per day kept: '+autos.length);
  assert.ok(!remaining.some(n=>n.includes('T')&&n.endsWith('Z.json')),'legacy UTC sprawl removed');
  const images=folder.dirs.get('images').files;
  assert.ok(images.has(usedImage),'referenced screenshot kept');assert.ok(!images.has('b'.repeat(64)+'.png'),'unreferenced screenshot removed');assert.ok(images.has('README.txt'),'foreign files untouched');
  assert.match(h.get('backupFolderStatus').textContent,/Removed \d+ snapshots and 1 unused screenshot file/);
  assert.equal(h.ctx.localStorage.getItem('dell-support.backup-cleanup-enabled'),'true');
  assert.match(h.get('backupSummary').textContent,/snapshots · .* · Keeping 30 days/);
});
test('automatic cleanup only reports until enabled, then runs after hourly snapshots and honors the retention choice',async()=>{
  const folder=fakeFolder();const h=harness({folder});await new Promise(setImmediate);
  const now=new Date(2026,9,3,12,0,0).getTime();h.setTime(now);
  for(let d=1;d<=40;d++)folder.files.set(B.fileName('history','auto',now-d*DAY-HOUR),'{}');
  const backup=h.intervals.find(i=>i.ms===60000).f;
  h.click('newNote');h.edit('notes','Work');await backup();await new Promise(setImmediate);await new Promise(setImmediate);
  assert.equal(folder.removed.length,0,'nothing removed before the user enables cleanup');
  assert.match(h.get('backupFolderStatus').textContent,/\d+ older snapshots .* can be removed/);
  h.get('backupRetention').value='7';h.get('backupRetention').listeners.change();
  assert.equal(h.ctx.localStorage.getItem('dell-support.backup-retention-days'),'7');assert.equal(h.ctx.localStorage.getItem('dell-support.backup-cleanup-enabled'),'true');
  h.setTime(now+HOUR);h.edit('notes','More');await backup();await new Promise(setImmediate);await new Promise(setImmediate);
  assert.ok(folder.removed.length>=33,'removed '+folder.removed.length);
  const autos=[...folder.files.keys()].map(B.parseFileName).filter(i=>i&&i.kind==='auto'&&i.type==='history');
  assert.ok(autos.every(i=>(now+HOUR)-i.time<7*DAY+HOUR));
  assert.match(h.get('backupFolderStatus').textContent,/Cleanup removed/);
  h.get('backupRetention').value='never';h.get('backupRetention').listeners.change();
  folder.removed.length=0;folder.files.set(B.fileName('history','auto',now-300*DAY),'{}');
  h.setTime(now+2*HOUR);h.edit('notes','Even more');await backup();await new Promise(setImmediate);
  assert.equal(folder.removed.length,0,'Forever keeps everything');
  const snapshot=JSON.parse(folder.files.get('customer-config.json'));assert.equal(snapshot.preferences.backupRetention,'never');
});
test('permanent deletion saves a safety copy to the backup folder first',async()=>{
  const folder=fakeFolder();const h=harness({folder});await new Promise(setImmediate);
  h.click('newNote');h.edit('notes','Doomed');
  h.get('historyList').children[0].children[1].listeners.click();
  assert.equal(C.parse(h.stored()).trash.length,1);assert.ok(![...folder.files.keys()].some(n=>n.includes('before-delete')),'moving to Trash is recoverable and needs no safety copy');
  h.get('trashFilter')?.listeners?.change?.();
});
test('retention preference round-trips through settings backups and rejects unknown values',()=>{
  const S=require('../case-settings-core.js');
  const captured=S.capture({getItem:key=>key==='dell-support.backup-retention-days'?'90':null});
  assert.equal(captured.backupRetention,'90');
  const settings=S.validate({fieldConfig:C.empty().fieldConfig,preferences:captured},C.fields);
  assert.equal(settings.values['dell-support.backup-retention-days'],'90');
  assert.throws(()=>S.validate({fieldConfig:C.empty().fieldConfig,preferences:{backupRetention:'forever'}},C.fields),/Invalid settings backup/);
  assert.equal(S.validate({fieldConfig:C.empty().fieldConfig,preferences:{backupRetention:null}},C.fields).values['dell-support.backup-retention-days'],null);
});
