const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const C = require('../js/case-notes-core.js');
const Sync = require('../js/case-sync-core.js');
test('sync files use portable names and can be read back for restore', async () => {
  const files = new Map();
  const folder = { async getFileHandle(name, options) {
    if (!files.has(name) && !options?.create) throw Error('missing ' + name);
    if (!files.has(name)) files.set(name, '');
    return {
      async getFile() { return { async text() { return files.get(name); } }; },
      async createWritable() { return { async write(value) { files.set(name, value); }, async close() {} }; }
    };
  }};
  await Sync.writeHistory(folder, '{"cases":[]}');
  await Sync.writeSettings(folder, '{"fieldConfig":{}}');
  assert.deepEqual([...files.keys()].sort(), ['case-history.json', 'customer-config.json']);
  assert.equal(await Sync.readFile(folder, Sync.HISTORY_FILE), '{"cases":[]}');
  assert.equal(await Sync.readFile(folder, Sync.SETTINGS_FILE), '{"fieldConfig":{}}');
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
      addEventListener(k,f){this.listeners[k]=f},removeEventListener(k){delete this.listeners[k]},focus(){this.focused=true;},contains(item){return item===this||this._children.includes(item);}
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
  const ctx={confirm:()=>true,CaseNotes:C,DevinPrompt:require('../js/devin-prompt-core.js'),document:{getElementById:get,createElement:element,createElementNS:element,addEventListener(k,f){const previous=events[k];events[k]=event=>{previous?.(event);return f(event);};}},window:{addEventListener(k,f){events[k]=f},dispatchEvent(event){events[event.type]?.(event);}},Event,localStorage:{getItem:()=>stored,setItem(k,v){if(writeError)throw Error('full');stored=v}},navigator:{locks:{request(k,optionsOrCallback,maybeCallback){const callback=typeof optionsOrCallback==='function'?optionsOrCallback:maybeCallback;if(locked)return new Promise(()=>{});return callback({});}},clipboard:{async writeText(text){if(copyError)throw Error('denied');ctx.copied=text}}},crypto:{randomUUID:()=>String(now)},Date:class extends Date{static now(){return now}},setInterval(f,ms){intervals.push({f,ms})},Promise,console};
  ctx.CaseSettings = require('../js/case-settings-core.js');
  ctx.CaseToolkitCore = require('../js/case-toolkit-core.js');
  ctx.CaseBackup = require('../js/case-backup-core.js');
  ctx.CaseSync = require('../js/case-sync-core.js');
  ctx.CaseExample = require('../js/case-example-core.js');
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
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/case-notes.js'),'utf8'),ctx);
  return {get,events,intervals,ctx,setTime:n=>now=n,stored:()=>stored,failWrite:v=>writeError=v,click:id=>get(id).listeners.click(),edit(id,value){get(id).value=value;get('noteForm').listeners.input({target:{id,value}})}};
}
test('Customize Site Options opens the customizer from the shared Settings menu without changing case data',()=>{
  const h=harness();const before=h.stored();
  h.click('customizeFields');assert.equal(h.get('fieldCustomizer').open,true);
  assert.equal(h.ctx.window.SiteTopbar.closed,1,'the shared Settings menu is closed');assert.equal(h.stored(),before);
});
test('Load Example adds a separate sample case with three dated notes and keeps the current case',()=>{
  const h=harness();h.setTime(Date.parse('2026-10-04T15:00:00'));h.click('newNote');h.edit('tag','MINE123');
  const mine=JSON.parse(h.stored()).selected;
  h.click('loadExampleNote');
  let saved=JSON.parse(h.stored());
  assert.equal(saved.selected,h.ctx.CaseExample.ID);
  assert.equal(saved.cases.find(n=>n.id===mine).tag,'MINE123','your own case is unchanged');
  assert.notEqual(saved.cases.find(n=>n.id===mine).started,null,'its timer keeps running');
  assert.equal(saved.cases.find(n=>n.id===h.ctx.CaseExample.ID).started,null);
  assert.match(h.get('historyList').children.find(row=>row.children[0].children[0].textContent.startsWith('Sample')).children[0].children[0].textContent,/^Sample · /);
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
test('selecting a dated tab scrolls only the tab strip, never the page',()=>{
 const state=C.empty(),note=C.create(state,'scroll',1000);
 for(let day=1;day<=3;day++){C.addEntry(note,'day'+day,1000+day*86400000);note.notes='Day '+day;C.syncEntry(note);}
 const h=harness({initial:JSON.stringify(state)}),strip=h.get('caseEntryTabs');let pageScrolls=0;
 // Lay tabs out 110px wide every 120px inside a 200px strip, so later tabs start out of view.
 strip.scrollLeft=0;strip.getBoundingClientRect=()=>({left:0,right:200});
 const create=h.ctx.document.createElement;
 h.ctx.document.createElement=(...args)=>{
  const el=create(...args);el.getAttribute=name=>el.attributes[name];el.scrollIntoView=()=>{pageScrolls++;};
  el.getBoundingClientRect=()=>{const left=strip.children.indexOf(el)*120-strip.scrollLeft;return {left,right:left+110};};
  return el;
 };
 const tabs=()=>strip.children;
 tabs()[1].listeners.click();assert.equal(h.get('notes').value,'');assert.equal(strip.scrollLeft,30);
 tabs()[4].listeners.keydown({key:'End',preventDefault(){}});assert.equal(h.get('notes').value,'Day 3');assert.equal(strip.scrollLeft,390);
 tabs()[4].listeners.keydown({key:'ArrowRight',preventDefault(){}});assert.equal(h.get('caseSummaryPanel').hidden,false);assert.equal(strip.scrollLeft,0);
 tabs()[0].listeners.keydown({key:'ArrowLeft',preventDefault(){}});assert.equal(h.get('notes').value,'Day 3');assert.equal(strip.scrollLeft,390);
 assert.equal(pageScrolls,0,'scrollIntoView would also scroll the page vertically to reach the tabs');
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
test('moving a case to Trash reports on the page',()=>{
  const h=harness();h.click('newNote');h.edit('tag','ABC1234');
  h.get('historyList').children[0].children[1].listeners.click();
  assert.equal(h.get('pageStatus').hidden,false);assert.match(h.get('pageStatus').textContent,/ABC1234 moved to Trash/);
});
test('field customizer changes stay in a draft until Save Configuration',async()=>{
  const h=harness();h.click('newNote');h.edit('notes','Keep');
  const before=h.stored();
  const lookup=h.ctx.document.getElementById;h.ctx.document.getElementById=id=>id==='siteName'?null:lookup(id); // the harness creates every element on demand
  h.click('customizeFields');
  h.get('newFieldId').value='siteName';h.get('newFieldLabel').value='Site';h.click('addCustomField');
  assert.equal(h.stored(),before,'adding only changes the draft');
  assert.equal(C.parse(h.stored()).fieldConfig.customFields.siteName,undefined);
  h.ctx.confirm=()=>true;h.click('closeCustomizer');
  assert.equal(h.get('fieldCustomizer').open,false);assert.equal(h.stored(),before,'closing discards the draft');
  h.click('customizeFields');h.get('newFieldId').value='siteName';h.get('newFieldLabel').value='Site';h.click('addCustomField');
  await h.click('saveFieldConfig');
  assert.equal(C.parse(h.stored()).fieldConfig.customFields.siteName,'Site');assert.equal(C.parse(h.stored()).cases[0].siteName,'');
  h.click('customizeFields');h.get('customFieldsList').children[0].children[2].listeners.click();
  assert.equal(C.parse(h.stored()).fieldConfig.customFields.siteName,'Site','removing waits for Save');
  await h.click('saveFieldConfig');
  assert.equal(C.parse(h.stored()).fieldConfig.customFields.siteName,undefined);assert.equal(C.parse(h.stored()).cases[0].notes,'Keep');
});
test('one damaged saved preference is skipped and named instead of stopping the settings backup',()=>{
  const S=require('../js/case-settings-core.js');
  const captured=S.capture({getItem:key=>key==='dell-support.case-notes-sections'?'{broken':key==='dell-support.pinned-resources.v1'?'["a"]':null});
  assert.deepEqual(captured.skipped,['sections']);assert.deepEqual(captured.pins,['a']);
  assert.equal('sections' in captured,false);assert.equal(JSON.stringify(captured).includes('skipped'),false);
  assert.throws(()=>S.validate({fieldConfig:C.empty().fieldConfig,preferences:{aiTasks:{t:{label:'x'.repeat(81),instruction:'y'}}}},C.fields),/Invalid settings backup/);
});
test('Load Example never archives a real case when Recent cases is full',()=>{
  const state=C.empty();for(let i=0;i<100;i++)C.create(state,'case'+i,1000+i);state.cases.forEach(n=>C.stop(n,5000));
  const h=harness({initial:JSON.stringify(state)});const before=h.stored();
  h.click('loadExampleNote');
  assert.equal(h.stored(),before);assert.match(h.get('pageStatus').textContent,/Recent cases is full/);
});

test('hiding a field warns once, waits for Save Configuration, and stores a browser preference',async()=>{
  const h=harness();h.click('newNote');const before=h.stored();
  const visibility=id=>h.get('fieldOrderList').children.find(row=>row.dataset.fieldId===id)?.children.find(child=>/field-visibility/.test(child.className));
  // The fake element keeps old children when askChoice clears it with textContent, so take the newest two buttons.
  const choice=index=>h.get('backupConfirmButtons').children.slice(-2)[index].listeners.click();
  h.click('customizeFields');
  for(const id of ['os','notes','next'])assert.equal(visibility(id),undefined,id+' cannot be hidden');
  let pending=visibility('tag').listeners.click();
  assert.equal(h.get('backupConfirmDialog').open,true,'first hide shows the warning');
  assert.match(h.get('backupConfirmMessage').textContent,/acknowledge that its information is still needed/);
  choice(0);await pending;
  assert.equal(visibility('tag').textContent,'Hide','Cancel keeps the field');
  assert.equal(h.ctx.localStorage.getItem('dell-support.hidden-fields-ack'),null);
  pending=visibility('tag').listeners.click();choice(1);await pending;
  assert.equal(visibility('tag').textContent,'Show');assert.equal(h.ctx.localStorage.getItem('dell-support.hidden-fields-ack'),'true');
  assert.equal(h.ctx.localStorage.getItem('dell-support.hidden-fields.v1'),null,'nothing is hidden before Save');
  h.get('backupConfirmDialog').open=false;
  await visibility('country').listeners.click();assert.equal(h.get('backupConfirmDialog').open,false,'the warning is shown only once');
  await h.click('saveFieldConfig');
  assert.deepEqual(JSON.parse(h.ctx.localStorage.getItem('dell-support.hidden-fields.v1')),['tag','country']);
  assert.deepEqual(C.parse(h.stored()).fieldConfig,C.parse(before).fieldConfig,'case data is unchanged');
  h.click('customizeFields');await visibility('tag').listeners.click();await visibility('country').listeners.click();await h.click('saveFieldConfig');
  assert.equal(h.ctx.localStorage.getItem('dell-support.hidden-fields.v1'),null,'showing every field clears the preference');
});
test('Recent cases switches between grid cards and a title-only list, and remembers the choice',()=>{
  const h=harness();h.click('newNote');
  assert.equal(h.get('historyList').classList.contains('history-compact'),false,'grid cards are the default');
  assert.equal(h.get('historyViewGrid').attributes['aria-pressed'],'true');
  const card=()=>h.get('historyList').children[0].children[0];
  h.click('historyViewList');
  assert.ok(h.get('historyList').classList.contains('history-compact'));
  assert.equal(h.get('historyViewList').attributes['aria-pressed'],'true');assert.equal(h.get('historyViewGrid').attributes['aria-pressed'],'false');
  assert.equal(h.ctx.localStorage.getItem('dell-support.case-history-view'),'list');
  assert.equal(card().title,'Untitled case','the full title is a tooltip when the list truncates it');
  h.click('historyViewGrid');
  assert.equal(h.get('historyList').classList.contains('history-compact'),false);assert.equal(h.ctx.localStorage.getItem('dell-support.case-history-view'),'grid');
});
test('List view hides everything but the case title',()=>{
  const css=fs.readFileSync(require.resolve('../css/case-notes.css'),'utf8');
  const hidden=/\.history-compact \.case-item span, \.history-compact \.case-item small, \.history-compact \.delete-case, \.history-compact \.case-row-actions \{ display:none; \}/;
  assert.match(css,hidden);
});
test('the case list layout is backed up and validated with other settings',()=>{
  const S=require('../js/case-settings-core.js');
  const captured=S.capture({getItem:k=>k==='dell-support.case-history-view'?'list':null});assert.equal(captured.historyView,'list');
  assert.equal(S.validate({fieldConfig:C.empty().fieldConfig,preferences:captured},C.fields).values['dell-support.case-history-view'],'list');
  assert.throws(()=>S.validate({fieldConfig:C.empty().fieldConfig,preferences:{historyView:'tiles'}},C.fields));
});
