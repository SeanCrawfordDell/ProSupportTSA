const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/case-notes-core.js');
const first = Date.parse('2026-10-02T15:00:00Z');
const second = Date.parse('2026-10-03T16:00:00Z');
function fixture() { const state=C.empty(); const note=C.create(state,'case-a',first); note.request='123'; note.notes='<p>Day one</p>'; note.next='Collect logs'; return {state,note}; }

test('legacy case notes migrate intact to one entry using the original timestamp, including archive and revisions',()=>{
 const {state,note}=fixture(); state.version=2; delete note.entries; delete note.activeEntryId;
 state.archive=[{...note,id:'archived',started:null}]; state.revisions={'case-a':[{savedAt:second,note:{...note}}]};
 const parsed=C.parse(JSON.stringify(state));
 for(const value of [parsed.cases[0],parsed.archive[0],parsed.revisions['case-a'][0].note]) {
  assert.equal(value.entries?.length,1); assert.equal(value.entries[0].created,first);
  assert.equal(value.entries[0].notes,'<p>Day one</p>'); assert.equal(value.entries[0].next,'Collect logs');
 }
});
test('new entries stay inside the case and retain prior content, shared details, and timer',()=>{
 const {state,note}=fixture(); const original=note.activeEntryId;
 assert.equal(typeof C.addEntry,'function'); C.addEntry(note,'day-two',second);
 assert.equal(state.cases.length,1); assert.equal(note.request,'123'); assert.equal(note.started,first);
 assert.equal(note.notes,''); assert.equal(note.next,'');
 note.notes='Day two'; note.next='Review findings'; C.syncEntry(note,second+1000);
 C.selectEntry(note,original); assert.equal(note.notes,'<p>Day one</p>'); assert.equal(note.next,'Collect logs');
 note.notes='Corrected day one'; C.syncEntry(note,second+2000);
 assert.equal(note.entries[0].created,first); assert.equal(note.entries[0].updated,second+2000);
 C.selectEntry(note,'day-two'); assert.equal(note.notes,'Day two'); assert.equal(note.next,'Review findings');
});
test('backup and recovery keep all entries, active selection, and screenshots',()=>{
 const {state,note}=fixture(); assert.equal(typeof C.addEntry,'function');
 note.images={img:{name:'Evidence',data:'data:image/png;base64,aGVsbG8='}}; note.notes='<img src="attachment:img" alt="Evidence">';
 C.addEntry(note,'day-two',second); note.notes='Latest details';
 const restored=C.parse(C.backup(state,second+1000)).cases[0];
 assert.equal(restored.entries.length,2); assert.equal(restored.activeEntryId,'day-two');
 assert.equal(restored.entries[1].notes,'Latest details'); assert.ok(restored.images.img);
 C.selectEntry(restored,restored.entries[0].id); assert.match(restored.notes,/attachment:img/);
});
test('full-case exports, escalation, and search include earlier days regardless of selected entry',()=>{
 const {note}=fixture(); assert.equal(typeof C.addEntry,'function'); C.addEntry(note,'day-two',second); note.notes='Day two'; note.next='Reboot';
 const text=C.copyText(note,second);
 assert.ok(text.indexOf('Day one')<text.indexOf('Day two')); assert.match(text,/Collect logs/); assert.match(text,/Reboot/);
 assert.match(C.searchText(note),/Day one/); assert.match(C.escalation(note,second).troubleshooting,/Day one/);
 C.selectEntry(note,note.entries[0].id);
 assert.match(C.copyText(note,second),/Day two/); assert.match(C.exportField(note,'notes'),/Day two/);
});
test('malformed dated entries are rejected instead of silently discarding history',()=>{
 const {state,note}=fixture(); assert.equal(typeof C.addEntry,'function'); C.addEntry(note,'day-two',second);
 for(const mutate of [n=>n.entries.push({...n.entries[0]}),n=>n.entries[0].created='bad',n=>n.entries[0].notes={},n=>n.activeEntryId='missing',n=>n.entries=[]]) {
  const copy=JSON.parse(JSON.stringify(state)); mutate(copy.cases[0]); assert.throws(()=>C.parse(JSON.stringify(copy)),/entry|entries/i);
 }
});
test('switching entries alone does not consume case recovery versions',()=>{
 const {state,note}=fixture(); assert.equal(typeof C.addEntry,'function'); C.addEntry(note,'day-two',second); C.syncEntry(note,second);
 const before=JSON.parse(JSON.stringify(state)); C.selectEntry(note,note.entries[0].id); C.checkpoint(state,before,second+1000);
 assert.equal(state.revisions[note.id]?.length || 0,0);
});

test('legacy custom fields that collide with entry metadata migrate without losing saved values',()=>{
 const {state,note}=fixture();state.version=2;
 state.fieldConfig.customFields={entries:'Legacy entries',activeEntryId:'Legacy ID',legacy_entries:'Already used'};
 state.fieldConfig.order.push('entries','activeEntryId','legacy_entries');
 note.entries='Old custom value';note.activeEntryId='Old custom ID';note.legacy_entries='Keep existing';
 state.archive=[{...note,id:'archived',started:null}];state.trash=[{...note,id:'trashed',started:null}];
 state.revisions={'case-a':[{savedAt:second,note:{...note}}]};
 const parsed=C.parse(JSON.stringify(state));
 const entriesKey=Object.keys(parsed.fieldConfig.customFields).find(k=>parsed.fieldConfig.customFields[k]==='Legacy entries');
 const idKey=Object.keys(parsed.fieldConfig.customFields).find(k=>parsed.fieldConfig.customFields[k]==='Legacy ID');
 for(const n of [parsed.cases[0],parsed.archive[0],parsed.trash[0],parsed.revisions['case-a'][0].note]){
  assert.equal(n[entriesKey],'Old custom value');assert.equal(n[idKey],'Old custom ID');
  assert.equal(n.legacy_entries,'Keep existing');assert.equal(n.entries.length,1);
 }
 const settings=require('../js/case-settings-core.js').validate({fieldConfig:state.fieldConfig},C.fields);
 assert.deepEqual(settings.fieldConfig,parsed.fieldConfig);
});
