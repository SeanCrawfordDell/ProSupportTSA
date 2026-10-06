const test=require('node:test'),assert=require('node:assert/strict');
const Notes=require('../js/case-notes-core.js'),Example=require('../js/case-example-core.js'),Rubric=require('../js/case-rubric-core.js'),Workflow=require('../js/case-workflow-core.js'),Toolkit=require('../js/case-toolkit-core.js');
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
  assert.deepEqual(note.toolkit.workflow.results,{},'sample leaves saved findings empty (removed on purpose in aa0be83)');
});
test('sample case works without a screenshot and fills custom fields',()=>{
  const state=Notes.empty();state.fieldConfig.customFields={customerContact:'Customer Contact'};
  const note=Example.build({now:Date.parse('2026-10-04T15:00:00'),customFields:state.fieldConfig.customFields});
  state.cases=[note];state.selected=note.id;
  const parsed=Notes.parse(JSON.stringify(state)).cases[0];
  assert.deepEqual(parsed.images,{});assert.equal(parsed.customerContact,'');
  assert.ok(!/<img|attachment:/.test(parsed.entries[1].notes),'no dangling screenshot reference');
});
test('Load Example builds ten valid sample cases: 2 overdue, 3 due within 4 hours and 5 later',()=>{
  const states=(cases,now)=>cases.map(note=>Toolkit.followupState(note,now)||'later');
  // Includes just after midnight, late evening and the US daylight-saving changes.
  for(const at of ['2026-10-04T15:00:00','2026-10-04T00:05:00','2026-10-04T23:50:00','2026-11-01T01:30:00','2026-03-08T01:30:00']){
    const now=Date.parse(at),state=Notes.empty();state.cases=Example.buildAll({now,image});state.selected=Example.ID;
    const cases=Notes.parse(JSON.stringify(state)).cases;
    assert.equal(cases.length,10,at);assert.deepEqual(cases.map(n=>n.id).sort(),[...Example.IDS].sort(),at);
    const count=states(cases,now).reduce((all,s)=>({...all,[s]:(all[s]||0)+1}),{});
    assert.deepEqual(count,{overdue:2,soon:3,later:5},at);
    assert.equal(Toolkit.followupState(cases.find(n=>n.id===Example.ID),now),'','the main sample follow-up is tomorrow');
    assert.equal(new Set(cases.map(n=>n.request.replace(/\s+/g,''))).size,10,at+' no duplicate SR numbers');
    for(const note of cases){
      assert.equal(note.started,null);assert.ok(note.created<=now && note.updated<=now,note.id+' no future times');
      assert.ok(Notes.entryList(note).every(e=>e.created<=now && Notes.plainText(e.notes).trim() && Notes.plainText(e.next).trim()),note.id+' has notes and next steps');
      assert.notEqual(note.toolkit.status,'Completed');assert.ok(note.toolkit.owner);
      assert.equal(Rubric.score(note).rating,'Strong',note.id+' models a strong case note');
    }
  }
  assert.ok(Example.IDS.every(Example.isSample));assert.equal(Example.isSample('3f2a9c1e-real-case'),false);
});
test('Support Trends leaves every sample case out',()=>{
  const fs=require('node:fs'),js=fs.readFileSync(require.resolve('../js/support-trends.js'),'utf8');
  const isSample=eval(/const isSample=(id=>[^;]+);/.exec(js)[1]);
  assert.ok(Example.IDS.every(isSample));assert.equal(isSample(crypto.randomUUID()),false);assert.equal(isSample('example-case-x'),false);
});
