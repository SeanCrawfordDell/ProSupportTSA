const test=require('node:test'),assert=require('node:assert/strict');
const Notes=require('../case-notes-core.js'),Example=require('../case-example-core.js'),Rubric=require('../case-rubric-core.js'),Workflow=require('../case-workflow-core.js'),Toolkit=require('../case-toolkit-core.js');
const image={name:'flep-event-27.png',data:'data:image/png;base64,iVBORw0KGgo='};
function load(options){
  const state=Notes.empty(),note=Example.build(options);
  state.cases=[note];state.selected=note.id;
  return Notes.parse(JSON.stringify(state)).cases[0];
}
const day=time=>new Date(time).toDateString();
test('sample case passes validation and fills every case detail',()=>{
  const note=load({now:Date.parse('2026-10-04T15:00:00'),image});
  for(const key of Object.keys(Notes.fields))assert.ok(note[key].trim(),key+' is filled');
  assert.equal(note.id,Example.ID);assert.equal(note.started,null);assert.ok(note.elapsed>2*3600000);
  assert.ok(note.images[Example.IMAGE_ID],'screenshot is stored with the case');
  assert.match(note.entries[1].notes,new RegExp('attachment:'+Example.IMAGE_ID));
});
test('sample notes span three different calendar days, oldest first, none in the future',()=>{
  // Includes just after midnight and the US daylight-saving changes.
  for(const at of ['2026-10-04T15:00:00','2026-10-04T00:05:00','2026-11-02T00:30:00','2026-03-09T00:30:00','2026-11-01T23:59:00']){
    const now=Date.parse(at),entries=Notes.entryList(load({now,image}));
    assert.equal(entries.length,3,at);
    assert.equal(new Set(entries.map(e=>day(e.created))).size,3,at+' uses three days');
    assert.equal(day(entries[2].created),day(now),at+' latest note is today');
    assert.ok(entries.every(e=>e.created<=now && e.updated<=now && e.updated>=e.created),at+' no future times');
    assert.ok(entries.every(e=>Notes.plainText(e.notes).trim() && Notes.plainText(e.next).trim()),at+' every day has notes and next steps');
  }
});
test('sample case scores Strong and is ready to verify and complete',()=>{
  const note=load({now:Date.parse('2026-10-04T15:00:00'),image});
  const score=Rubric.score(note);
  assert.equal(score.rating,'Strong');assert.equal(score.total,100);assert.deepEqual(score.gaps,[]);
  assert.deepEqual(Workflow.gaps(note),[]);
  assert.ok(Toolkit.checklist(note).every(item=>note.toolkit.checks[item.id]),'every evidence item is checked');
  assert.ok(Date.parse(note.toolkit.due)>Date.parse('2026-10-04T15:00:00'),'follow-up is upcoming, not overdue');
  for(const key of ['impact','questions','owner','customerDraft','summaryDraft'])assert.ok(note.toolkit[key].trim(),key);
  assert.ok(note.toolkit.workflow.knowledge.startsWith('KNOWLEDGE CANDIDATE'));
  assert.ok(Object.keys(note.toolkit.workflow.results).length>=2,'saved findings are present');
});
test('sample case works without a screenshot and fills custom fields',()=>{
  const state=Notes.empty();state.fieldConfig.customFields={customerContact:'Customer Contact'};
  const note=Example.build({now:Date.parse('2026-10-04T15:00:00'),customFields:state.fieldConfig.customFields});
  state.cases=[note];state.selected=note.id;
  const parsed=Notes.parse(JSON.stringify(state)).cases[0];
  assert.deepEqual(parsed.images,{});assert.equal(parsed.customerContact,'');
  assert.ok(!/<img|attachment:/.test(parsed.entries[1].notes),'no dangling screenshot reference');
});
