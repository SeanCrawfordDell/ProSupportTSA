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
  for(let i=0;i<15;i++){const prev=structuredClone(state);state.cases[0].notes='Version '+i;C.checkpoint(state,prev,2000+i);}
  assert.equal(state.revisions.a.length,10); assert.equal(state.revisions.a[0].note.notes,'Version 13');
  const prev=structuredClone(state);state.cases[0].elapsed=100;state.cases[0].updated=9999; C.checkpoint(state,prev,9999);
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
