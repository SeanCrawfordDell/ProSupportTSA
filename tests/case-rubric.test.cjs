const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../js/case-rubric-core.js'),C=require('../js/case-notes-core.js'),T=require('../js/case-toolkit-core.js');
const blank=()=>C.create(C.empty(),'n1',1000);
// Scaffolding the former Apply template button wrote into notes; older cases still hold it.
const legacyNotes=key=>`<h3>${T.issueTypes[key].name}</h3>`+T.issueTypes[key].prompts.map(p=>`<p><strong>${p}:</strong> [Add details]</p>`).join('');
const legacyNext='<h3>Next steps</h3><p>Action: [Add next action]</p><p>Owner: [Assign owner]</p><p>Follow-up: [Agree date and time]</p>';
test('empty note scores zero and lists the biggest gaps first',()=>{
 const r=R.score(blank());assert.equal(r.total,0);assert.equal(r.rating,'Incomplete');
 assert.equal(Object.values(R.maxima).reduce((a,b)=>a+b,0),100);
 for(let i=1;i<r.gaps.length;i++)assert.ok(r.gaps[i-1].points>=r.gaps[i].points);
});
test('legacy template prompts alone earn no troubleshooting credit',()=>{
 const note=blank();note.notes=legacyNotes('network');
 assert.equal(R.score(note).categories.troubleshooting,0);
});
test('a complete, specific note scores Strong',()=>{
 const note=blank();
 Object.assign(note,{request:'123456789',tag:'ABC1234',platform:'PowerEdge R750',os:'Windows Server',osVersion:'Windows Server 2022 build 20348',country:'US',supportType:'OEM OS',logLocation:'https://example.com/logs',
  issue:'iDRAC web UI returns HTTP 503 after login on one host since the 7.10.20.00 update; Redfish API still responds. Affects management of 1 of 24 hosts.',
  notes:'<ol><li>Tested Chrome and Edge - same 503 error.</li><li>Restarted iDRAC - UI returned for 12 minutes then failed again.</li><li>LC log shows RAC0182 before each failure.</li></ol>',
  next:'<ol><li>Upgrade iDRAC firmware to 7.10.30.00.</li><li>Monitor for 24 hours and confirm with the customer.</li></ol>'});
 note.toolkit.owner='Sean';note.toolkit.workflow={recentChange:'iDRAC firmware update',severity:'Service degraded',results:{},fix:'',verification:'',confirmed:false,prevention:'',repeatOf:'',knowledge:''};
 for(const item of T.checklist(note))note.toolkit.checks[item.id]=true;
 const r=R.score(note);assert.equal(r.total,100);assert.equal(r.rating,'Strong');assert.equal(r.gaps.length,0);
});
test('legacy OS support codes migrate to the entitlement options',()=>{
 const state=C.empty();const note=C.create(state,'n2',1000);note.supportType='PSP';
 const parsed=C.parse(JSON.stringify(state));assert.equal(parsed.cases[0].supportType,'ProSupport Plus Bring Your own License');
 assert.equal(C.normalizeSupportType('OEM'),'OEM OS');assert.equal(C.normalizeSupportType('No OS Support'),'No Software Support');
 assert.equal(C.escalation({...note,supportType:'OEM'},2000).supportType,'OEM OS');
});
test('untouched default next-step scaffolding earns no next-step credit',()=>{
 const note=blank();note.next=legacyNext;
 assert.equal(R.score(note).categories.next,0);
});
test('No OS plans list the iDRAC collection once on PowerEdge platforms',()=>{
 const L=require('../js/log-helper-core.js');
 const items=L.plan({os:'No OS',platform:'PowerEdge R750'}).items;
 assert.equal(items.filter(i=>/SupportAssist/.test(i.title+' '+i.how)).length,1);
});

// --- Content scoring: fixtures from the scoring review (items 1-8 and 15) ---
const W=require('../js/case-workflow-core.js'),fs=require('node:fs');
const lorem='Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident 1 same.';
const allChecks=note=>{for(const item of T.checklist(note))note.toolkit.checks[item.id]=true;};
function strong(){
 const note=blank();
 Object.assign(note,{request:'123456789',tag:'ABC1234',platform:'PowerEdge R750',os:'Windows Server',osVersion:'Windows Server 2022 build 20348',country:'US',supportType:'OEM OS',logLocation:'https://example.com/logs',
  issue:'iDRAC web UI returns HTTP 503 after login on one host since the 7.10.20.00 update; Redfish API still responds. Affects management of 1 of 24 hosts.',
  notes:'<ol><li>Tested Chrome and Edge - same 503 error.</li><li>Restarted iDRAC - UI returned for 12 minutes then failed again.</li><li>LC log shows RAC0182 before each failure.</li></ol>',
  next:'<ol><li>Upgrade iDRAC firmware to 7.10.30.00.</li><li>Monitor for 24 hours and confirm with the customer.</li></ol>'});
 note.toolkit.owner='Sean';note.toolkit.workflow={...W.defaults(),recentChange:'iDRAC firmware update',severity:'Service degraded'};
 allChecks(note);return note;
}
test('lorem ipsum with one digit, one outcome word and x in every detail cannot reach Strong',()=>{
 const note=blank();
 Object.assign(note,{request:'x',tag:'x',platform:'x',os:'Windows Server',osVersion:'x',country:'US',supportType:'OEM OS',logLocation:'x',issue:lorem,notes:lorem,next:lorem});
 note.toolkit.owner='x';note.toolkit.impact='x';note.toolkit.workflow={...W.defaults(),recentChange:'x'};allChecks(note);
 const r=R.score(note);
 assert.notEqual(r.rating,'Strong');assert.ok(r.total<60,String(r.total));
 assert.equal(r.categories.issue,0);assert.equal(r.categories.troubleshooting,0);assert.equal(r.categories.next,0);
 assert.ok(r.gaps.some(g=>/placeholder/.test(g.text)&&g.blocking));
 assert.ok(r.categories.details<25);assert.equal(r.categories.triage,0);
});
test('the same sentence pasted into every field earns credit once and names both fields',()=>{
 const sentence='The iDRAC web UI returns HTTP 503 after login on host DC2-HV-047 since the 7.10.20.00 firmware update and all users are affected.';
 const note=strong();Object.assign(note,{issue:sentence,notes:sentence,next:sentence});note.toolkit.impact=sentence;note.toolkit.workflow.recentChange=sentence;note.toolkit.workflow.severity='Unspecified';
 const r=R.score(note);
 assert.notEqual(r.rating,'Strong');assert.ok(r.total<85,String(r.total));
 assert.ok(r.categories.issue>0);assert.equal(r.categories.troubleshooting,0);assert.equal(r.categories.next,0);
 assert.ok(r.gaps.some(g=>/Notes repeats the Issue Description/.test(g.text)&&g.blocking));
 assert.ok(r.gaps.some(g=>/Action Plan \/ Next Steps repeats the Issue Description/.test(g.text)));
 assert.equal(R.text.duplicate(sentence,sentence),true);assert.equal(R.text.duplicate('a b c d e','a b c d f'),false);
});
test('numbered steps without recorded outcomes stay below Strong whatever the total',()=>{
 const note=strong();
 note.notes='<ol><li>Tested Chrome and Edge browsers on the 503 page.</li><li>Restarted the iDRAC controller from racadm.</li><li>Exported the Lifecycle Controller log RAC0182.</li></ol>';
 const none=R.score(note);
 assert.ok(none.total>=85,String(none.total));assert.equal(none.rating,'Needs detail');
 assert.ok(none.gaps.some(g=>/0 of 3 have one/.test(g.text)&&g.blocking&&g.points===7));
 note.notes='<ol><li>Tested Chrome and Edge browsers - same 503 error.</li><li>Restarted the iDRAC controller from racadm.</li><li>Exported the Lifecycle Controller log RAC0182.</li></ol>';
 const partial=R.score(note);
 assert.ok(partial.categories.troubleshooting>none.categories.troubleshooting&&partial.categories.troubleshooting<25);assert.equal(partial.rating,'Needs detail');
 note.notes='<ol><li>Tested Chrome and Edge browsers - same 503 error.</li><li>Restarted the iDRAC controller - UI returned for 12 minutes.</li><li>Exported the Lifecycle Controller log RAC0182.</li></ol>';
 const half=R.score(note);assert.equal(half.categories.troubleshooting,25);assert.equal(half.rating,'Strong');
});
test('impact, recent change and owner written in the note text score the same as the dialogs',()=>{
 const note=strong();note.toolkit.owner='';note.toolkit.impact='';delete note.toolkit.workflow;
 note.issue+=' Business impact: the infrastructure team is blocked from the firmware compliance review. Recent change: iDRAC firmware updated 7.10.20.00 to 7.10.30.00.';
 note.next+='<p>Owner: Sean, follow-up 2026-10-04 10:00.</p>';
 const r=R.score(note);assert.equal(r.total,100);assert.equal(r.rating,'Strong');assert.deepEqual(r.gaps,[]);
 // The strong issue text already says "since the 7.10.20.00 update", so the change half of Triage is earned from the text alone.
 const bare=strong();bare.toolkit.owner='';bare.toolkit.impact='';delete bare.toolkit.workflow;
 const b=R.score(bare);assert.equal(b.categories.triage,3);assert.equal(b.categories.next,10);
 assert.ok(b.gaps.some(g=>/Business impact under Handoff Summary/.test(g.text)));
 bare.issue='iDRAC web UI returns HTTP 503 when the login completes on one host; Redfish API still responds. Management of 1 of 24 hosts is unavailable.';
 assert.equal(R.score(bare).categories.triage,0);assert.ok(R.score(bare).gaps.some(g=>/Record the recent change in Triage or in the Issue Description/.test(g.text)));
 assert.ok(b.gaps.some(g=>/name the owner and date in the Action Plan/.test(g.text)));
});
test('template prompt labels with short answers earn nothing while real answers after the label count',()=>{
 const note=blank();note.notes=legacyNotes('network').replace(/\[Add details\]/g,'ok');
 assert.equal(R.score(note).categories.troubleshooting,0);
 assert.equal(R.clean('<p><strong>Expected versus observed connectivity:</strong> ping to 10.0.0.5 fails with timeout</p>'),'ping to 10.0.0.5 fails with timeout');
 assert.equal(R.clean('<p><strong>Expected versus observed connectivity:</strong> n/a</p>'),'');
 assert.equal(R.clean('<p>Owner: ok</p><p>Action: Replace the failed DIMM in slot A3 and retest.</p>'),'Replace the failed DIMM in slot A3 and retest.');
 note.notes='<h3>Network / DNS connectivity</h3><p><strong>Source and destination:</strong> 10.0.0.5 to 10.0.1.9 over VLAN 120</p><p><strong>Tests performed and results:</strong> ping returned 100% loss and traceroute stopped at the core switch</p>';
 assert.ok(R.score(note).categories.troubleshooting>0);
});
test('triage is scored separately from issue clarity and the help text explains the rules',()=>{
 assert.equal(R.maxima.issue,14);assert.equal(R.maxima.triage,6);assert.equal(R.labels.triage,'Triage');
 assert.equal(Object.values(R.maxima).reduce((a,b)=>a+b,0),100);
 const r=R.score(blank());
 assert.ok(r.gaps.some(g=>g.category==='triage'&&/Set Service Impact in Triage, record the Business impact under Handoff Summary/.test(g.text)));
 assert.ok(!r.gaps.some(g=>g.category==='issue'&&/impact|recent change/i.test(g.text)));
 const html=fs.readFileSync(require.resolve('../case-notes.html'),'utf8');
 assert.match(html,/repeated or placeholder text/);assert.match(html,/every dated entry/);assert.match(html,/Service Tag \(5–10 letters and digits\)/);
});
test('case details check formats, give half credit on mismatch, and no longer count the issue description',()=>{
 const anything=blank();Object.assign(anything,{request:'x',tag:'x',platform:'x',os:'x',osVersion:'x',country:'x',supportType:'x',issue:'x'});
 const a=R.score(anything);assert.ok(a.categories.details<25);assert.equal(a.categories.details,20);
 for(const text of [/Service Tag should be 5–10 letters and digits/,/at least 6 digits/,/version or build number/])assert.ok(a.gaps.some(g=>g.category==='details'&&text.test(g.text)),String(text));
 const issueOnly=blank();issueOnly.issue=strong().issue;assert.equal(R.score(issueOnly).categories.details,0);
 const good=strong();assert.equal(R.score(good).categories.details,25);
 assert.ok(R.score({...good,tag:'abc'}).categories.details<25);assert.ok(R.score({...good,request:'SR-555'}).categories.details<25);
 assert.equal(R.score({...good,tag:'abc1234'}).categories.details,25);
 const location=R.score({...good,logLocation:'Case attachment'});
 assert.equal(location.categories.evidence,12);assert.ok(location.gaps.some(g=>/link, UNC path, or absolute path/.test(g.text)));
 for(const path of ['\\\\fileserver\\logs\\case123','C:\\logs\\sr123','/var/log/case-123','https://example.com/logs'])assert.equal(R.score({...good,logLocation:path}).categories.evidence,15,path);
});
test('every dated entry is scored together so a short follow-up entry does not drop the case',()=>{
 const note=strong();assert.equal(R.score(note).total,100);
 C.addEntry(note,'day2',2000);note.notes='Called customer, left voicemail.';note.next='';
 const r=R.score(note);assert.equal(r.total,100);assert.equal(r.rating,'Strong');
 const fresh=strong();C.addEntry(fresh,'day2',2000);fresh.notes='Called customer, left voicemail.';C.selectEntry(fresh,fresh.entries[0].id);
 assert.equal(R.score(fresh).total,100);
});
test('text plausibility flags repeated and placeholder text but not long real notes',()=>{
 const f=R.text.filler;
 assert.equal(f('blah blah blah blah blah blah blah blah'),true);
 assert.equal(f('test test test test test test test 1'),true);
 assert.equal(f(lorem),true);
 assert.equal(f('No change.\nNo change.\nNo change.'),true);
 assert.equal(f('1. asdf 2. asdf 3. asdf'),true);
 assert.equal(f(''),false);assert.equal(f('x'),false);
 assert.equal(f('Called customer, left voicemail.'),false);
 assert.equal(f(R.clean(strong().notes)),false);
 assert.equal(f('1. Rebooted - no change\n2. Reseated NIC - no change\n3. Updated driver - error persisted'),false);
 // Dotted addresses and versions stay whole tokens, so terse host or firmware lists are not repeated text.
 assert.equal(f('10.0.0.5 unreachable. 10.0.0.6 unreachable. 10.0.0.7 unreachable. 10.0.0.8 unreachable.'),false);
 assert.equal(f('1. Node 1 - 7.10.20.00\n2. Node 2 - 7.10.20.00\n3. Node 3 - 7.10.30.00'),false);
 assert.equal(f('Error 0x80070002. Error 0x80070002 again. Error 0x80070002 on retry.'),false);
 assert.equal(f(fs.readFileSync(require.resolve('../docs/CASE_NOTES_GUIDE.md'),'utf8')),false);
 assert.equal(f(fs.readFileSync(require.resolve('../docs/DEV-NOTES.md'),'utf8')),false);
});
test('handoff maps recent change, service impact and evidence onto the escalation and leaves results empty',()=>{
 const note=strong();const payload=C.escalation(note,2000);
 assert.equal(payload.changes,'iDRAC firmware update');assert.equal(payload.production,'Service degraded');assert.equal(payload.evidence,'Yes');assert.equal(payload.results,'');
 note.toolkit.workflow.severity='Service unavailable';assert.equal(C.escalation(note,2000).production,'Service unavailable');
 note.toolkit.workflow.severity='Deployment';assert.equal(C.escalation(note,2000).production,'Deployment');
 note.toolkit.workflow.severity='Unspecified';assert.equal(C.escalation(note,2000).production,'');
 const bare=blank();assert.equal(C.escalation(bare,2000).evidence,'');assert.equal(C.escalation(bare,2000).changes,'');assert.equal(C.escalation(bare,2000).production,'');
 bare.toolkit.checks.incident=true;assert.equal(C.escalation(bare,2000).evidence,'Yes');
 const located=blank();located.logLocation='\\\\server\\share\\logs';assert.equal(C.escalation(located,2000).evidence,'Yes');
});
