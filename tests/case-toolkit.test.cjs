const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../js/case-notes-core.js'),T=require('../js/case-toolkit-core.js');
test('old case histories receive toolkit defaults and new metadata round-trips through backup',()=>{
 const state=C.empty(),note=C.create(state,'old',1000);delete note.toolkit;
 const restored=C.parse(JSON.stringify(state));assert.equal(restored.cases[0].toolkit.status,'Open');
 const data=restored.cases[0].toolkit;
 Object.assign(data,{owner:'Team A',due:'2026-09-14T14:00:00.000Z',status:'Waiting on customer',customerDraft:'Reviewed update',summaryDraft:'Reviewed summary'});
 data.timeline.push({id:'entry',at:2000,action:'Rebooted controller',result:'Issue persists'});data.checks.incident=true;
 assert.deepEqual(C.parse(C.backup(restored,3000)).cases[0].toolkit,data);
 data.due='bad date';assert.throws(()=>C.parse(JSON.stringify(restored)),/toolkit/);
});
test('overdue ignores completed cases and handles exact deadlines',()=>{
 const note=C.create(C.empty(),'due',1000);note.toolkit.due='2026-09-14T14:00:00.000Z';
 const due=Date.parse(note.toolkit.due);assert.equal(T.overdue(note,due),false);assert.equal(T.overdue(note,due+1),true);
 note.toolkit.status='Completed';assert.equal(T.overdue(note,due+1),false);
});
test('each OS has linked collection guidance and issue types add relevant evidence',()=>{
 for(const os of ['Windows Server','Redhat','Ubuntu','Debian','Nutanix','ESX','VCF','Azure Stack Hub','Azure Local']){
  const note=C.create(C.empty(),'logs',1000);note.os=os;note.toolkit.issueType='crash';
  const items=T.checklist(note);assert.ok(items.some(i=>i.url?.startsWith('https://')));assert.ok(items.some(i=>i.id==='issue-crash'));
 }
 const note=C.create(C.empty(),'blank',1000);assert.ok(!T.checklist(note).some(i=>i.url));
});
test('drafts use supplied facts and missing information remains explicit',()=>{
 const note=C.create(C.empty(),'draft',1000);note.issue='Management interface timeout';note.request='00123';note.notes='<p>Restarted service</p>';note.next='<p>Collect trace</p>';
 note.toolkit.impact='One administrator blocked';note.toolkit.questions='Does the issue recur after restart?';
 note.toolkit.timeline.push({id:'action',at:2000,action:'Restarted service',result:'Timeout returned'});
 const update=T.customerUpdate(note,C.plainText);assert.ok(update.includes('00123'));assert.ok(update.includes('Restarted service'));assert.ok(update.includes('[Confirm date and time]'));
 const summary=T.summary(note,C.plainText,'00:01:00');assert.ok(summary.includes('One administrator blocked'));assert.ok(summary.includes('Does the issue recur'));assert.ok(summary.includes('Not assigned'));
 assert.ok(!C.copyText(note,3000).includes('Troubleshooting timeline:'));assert.ok(!C.escalation(note,3000).sourceNote.includes('Timeout returned'));
 assert.ok(!T.summary(note,C.plainText,'00:01:00').includes('Troubleshooting timeline:'));
});
test('every issue type has a name and investigation prompts',()=>{
 for(const [key,item] of Object.entries(T.issueTypes)){assert.ok(item.name.trim(),key);assert.ok(item.prompts.length>=6,key);}
});

test('System/Platform saves, restores and appears in case outputs',()=>{
 const state=C.empty(),note=C.create(state,'platform',1000);note.platform='PowerEdge R750';
 assert.equal(C.parse(C.backup(state,2000)).cases[0].platform,'PowerEdge R750');
 assert.ok(C.copyText(note,2000).includes('System/Platform:'));assert.ok(C.escalation(note,2000).sourceNote.includes('PowerEdge R750'));
 assert.ok(T.summary(note,C.plainText,'00:00:01').includes('System/Platform: PowerEdge R750'));
 delete note.platform;assert.equal(C.parse(JSON.stringify(state)).cases[0].platform,'');
});

test('issueTypesFor gives Systems Management only fix ME OMSA and every other OS the rest',()=>{
 assert.deepEqual(T.issueTypesFor('Systems Management'),['fix ME OMSA']);
 for(const os of ['','Windows Server','Redhat'])assert.deepEqual(T.issueTypesFor(os),Object.keys(T.issueTypes).filter(id=>id!=='fix ME OMSA'));
 assert.equal(T.defaultIssueType('Systems Management'),'fix ME OMSA');assert.equal(T.defaultIssueType('ESX'),'general');
});
