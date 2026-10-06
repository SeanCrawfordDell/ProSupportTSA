const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/case-notes-core.js');
const S = require('../js/case-settings-core.js');
test('overflow archives all older cases with their screenshots, fields and revisions', () => {
  const state = C.empty(); C.addCustomField(state,'siteName','Site');
  const first = C.create(state,'first',1000); first.siteName = 'Lab'; first.notes = 'before';
  first.images = {sample:{name:'test',data:'data:image/png;base64,YQ=='}};
  const previous = structuredClone(state); first.notes = 'after'; C.checkpoint(state,previous,2000);
  for(let i=0;i<110;i++) C.create(state,'case-'+i,3000+i);
  const backup = C.parse(C.backup(state,5000));
  assert.equal(backup.cases.length,100); assert.equal(backup.archive.length,11);
  const archived = backup.archive.find(n=>n.id==='first');
  assert.equal(archived.siteName,'Lab'); assert.equal(archived.images.sample.data,first.images.sample.data);
  assert.equal(backup.revisions.first[0].note.notes,'before'); assert.equal(archived.started,null);
  C.move(backup,'first','archive','cases',6000);
  assert.equal(backup.selected,'first'); assert.equal(backup.cases.length,100); assert.equal(backup.archive.length,11);
});
test('trash and restore preserve data and stop the deleted case timer', () => {
  const state = C.empty(); const note = C.create(state,'a',1000); note.notes='Keep me';
  C.move(state,'a','cases','trash',4000);
  assert.equal(state.selected,null); assert.equal(state.trash[0].elapsed,3000);
  const restored = C.parse(C.backup(state,5000)); C.move(restored,'a','trash','cases',6000);
  assert.equal(restored.cases[0].notes,'Keep me'); assert.equal(restored.cases[0].started,null);
});
test('versions record changed content, cap at ten, and do not record timer-only changes', () => {
  const state = C.empty(); C.create(state,'a',1000);
  const gap=C.VERSION_INTERVAL;
  for(let i=0;i<15;i++){const prev=structuredClone(state);state.cases[0].notes='Version '+i;C.checkpoint(state,prev,2000+i*gap);}
  assert.equal(state.revisions.a.length,10); assert.equal(state.revisions.a[0].note.notes,'Version 13');
  const last=2000+20*gap;
  const prev=structuredClone(state);state.cases[0].elapsed=100;state.cases[0].updated=last; C.checkpoint(state,prev,last);
  assert.equal(state.revisions.a[0].note.notes,'Version 13');
});
test('search finds note body, next steps, custom fields and toolkit without HTML markup',()=>{
  const state=C.empty();const note=C.create(state,'a',0);
  note.notes='<p>adapter failure</p>';note.next='Collect trace';note.location='London';note.toolkit.owner='Alice';
  for(const term of ['adapter','trace','London','Alice'])assert.ok(C.searchText(note).includes(term));
  assert.ok(!C.searchText(note).includes('<p>'));assert.match(C.excerpt(note,'adapter'),/adapter failure/);
});
const fixture = () => ({fieldConfig:C.empty().fieldConfig,toolbox:{shortcuts:[{name:'Docs',url:'https://example.com'}],appearance:{order:['copy'],colors:{launcher:'#123456'}}},preferences:{aiTasks:{custom:{label:'Custom',instruction:'Review notes'}},theme:'dark',floating:'false',historyCollapsed:'true',sections:{notes:true},pins:['case-notes']}});
test('settings validate all supported preferences and reject invalid imports before writes',()=>{
  const valid=S.validate(fixture(),C.fields);assert.equal(valid.values.theme,'dark');
  assert.match(valid.values['dell-support.custom-ai-tasks'],/Review notes/);
  for(const mutate of [c=>c.toolbox.shortcuts[0].url='javascript:alert(1)',c=>c.toolbox.appearance.colors.copy='red',c=>c.preferences.aiTasks.custom.label={},c=>c.fieldConfig.customFields.id='Bad']){
    const c=fixture();mutate(c);assert.throws(()=>S.validate(c,C.fields));
  }
  assert.doesNotThrow(()=>S.validate({fieldConfig:C.empty().fieldConfig},C.fields));
});
test('settings write failure rolls back earlier preferences and preserves history',()=>{
  const data=new Map([['theme','light'],['history','original']]);
  const storage={getItem:k=>data.get(k)??null,removeItem:k=>data.delete(k),setItem(k,v){if(k==='history')throw Error('quota');data.set(k,v);}};
  assert.throws(()=>S.commit(storage,{theme:'dark',history:'replacement'}),/Previous settings were kept/);
  assert.equal(data.get('theme'),'light');assert.equal(data.get('history'),'original');
});
test('older histories gain recovery collections and malformed archive fails safely',()=>{
  const old=C.empty();C.create(old,'old',0);delete old.archive;delete old.trash;delete old.revisions;
  assert.deepEqual(C.parse(JSON.stringify(old)).archive,[]);
  old.archive=[{id:'broken'}];assert.throws(()=>C.parse(JSON.stringify(old)));
});
test('saves during one editing burst share a version instead of replacing the history', () => {
  const state = C.empty(); C.create(state,'a',1000);
  const edit=(text,at)=>{const prev=structuredClone(state);state.cases[0].notes=text;C.checkpoint(state,prev,at);};
  edit('first',10000);
  for(let i=1;i<30;i++) edit('typing '+i,10000+i*10000); // every 10 seconds for almost 5 minutes
  assert.equal(state.revisions.a.length,1,'one version for the burst');
  assert.equal(state.revisions.a[0].note.notes,'','the version is the text before the burst began');
  edit('later',10000+C.VERSION_INTERVAL+1);
  assert.equal(state.revisions.a.length,2); assert.equal(state.revisions.a[0].note.notes,'typing 29');
});
test('screenshots are stored once per case and dropped when nothing references them', () => {
  const data='data:image/png;base64,aGVsbG8=';
  const state = C.empty(); const note=C.create(state,'a',1000);
  note.images={kept:{name:'Kept',data},gone:{name:'Gone',data},fresh:{name:'Fresh',data}};
  note.notes='<img src="attachment:kept">'; C.syncEntry(note);
  const prev=structuredClone(state); note.notes='rewritten'; C.syncEntry(note); C.checkpoint(state,prev,2000);
  assert.deepEqual(state.revisions.a[0].note.images,{},'the version holds no copies');
  assert.equal(C.pruneImages(state,new Set(['fresh'])),1);
  assert.deepEqual(Object.keys(note.images).sort(),['fresh','kept'],'a version reference keeps a screenshot; new ones are spared');
  state.revisions={}; assert.equal(C.pruneImages(state),2); assert.deepEqual(note.images,{});
  for(let i=0;i<12;i++){const p=structuredClone(state);note.images['s'+i]={name:'S',data:'data:image/png;base64,'+'A'.repeat(200000)};note.notes+=`<img src="attachment:s${i}">`;C.syncEntry(note);C.checkpoint(state,p,3000+i*C.VERSION_INTERVAL);}
  assert.ok(JSON.stringify(state).length<12*200000*1.1,'history grows with screenshots, not screenshots times versions');
});

test('hidden fields and their acknowledgement are backed up, validated and cleared with other settings',()=>{
 const S=require('../js/case-settings-core.js'),C=require('../js/case-notes-core.js');
 const values=new Map([['dell-support.hidden-fields.v1','["tag"]'],['dell-support.hidden-fields-ack','true']]);
 const captured=S.capture({getItem:key=>values.get(key)??null});
 assert.deepEqual(captured.hiddenFields,['tag']);assert.equal(captured.hiddenFieldsAck,'true');
 assert.deepEqual(S.capture({getItem:()=>null}).hiddenFields,[]);
 const restored=S.validate({fieldConfig:C.empty().fieldConfig,preferences:captured},C.fields);
 assert.equal(restored.values['dell-support.hidden-fields.v1'],'["tag"]');assert.equal(restored.values['dell-support.hidden-fields-ack'],'true');
 for(const bad of [{hiddenFields:'tag'},{hiddenFields:[1]},{hiddenFields:['<x>']},{hiddenFieldsAck:'yes'}])
  assert.throws(()=>S.validate({fieldConfig:C.empty().fieldConfig,preferences:bad},C.fields));
 const cleared=S.clearValues();assert.equal(cleared['dell-support.hidden-fields.v1'],null);assert.ok(Object.hasOwn(cleared,'dell-support.hidden-fields-ack'));
});
