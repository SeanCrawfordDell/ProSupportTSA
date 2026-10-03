const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../case-rubric-core.js'),C=require('../case-notes-core.js'),T=require('../case-toolkit-core.js');
const blank=()=>C.create(C.empty(),'n1',1000);
test('empty note scores zero and lists the biggest gaps first',()=>{
 const r=R.score(blank());assert.equal(r.total,0);assert.equal(r.rating,'Incomplete');
 assert.equal(Object.values(R.maxima).reduce((a,b)=>a+b,0),100);
 for(let i=1;i<r.gaps.length;i++)assert.ok(r.gaps[i-1].points>=r.gaps[i].points);
});
test('applied template prompts alone earn no troubleshooting credit',()=>{
 const note=blank();note.notes=T.templateHtml('network');
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
 const note=blank();note.next=T.templateNextHtml('network');
 assert.equal(R.score(note).categories.next,0);
});
test('No OS plans list the iDRAC collection once on PowerEdge platforms',()=>{
 const L=require('../log-helper-core.js');
 const items=L.plan({os:'No OS',platform:'PowerEdge R750'}).items;
 assert.equal(items.filter(i=>/SupportAssist/.test(i.title+' '+i.how)).length,1);
});
