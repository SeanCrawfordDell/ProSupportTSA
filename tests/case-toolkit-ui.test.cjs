const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const C=require('../js/case-notes-core.js'),T=require('../js/case-toolkit-core.js');
function setup(){
 const elements={};
 const get=id=>elements[id]??={value:'',textContent:'',disabled:false,handlers:{},replaceChildren(...items){this.children=items;},append(item){this.children.push(item);},addEventListener(k,f){this.handlers[k]=f;}};
 const note=C.create(C.empty(),'example',1000);note.notes='<p>Existing notes</p>';note.next='<p>Existing plan</p>';
 let editable=true;
 const window={};
 vm.runInNewContext(fs.readFileSync(require.resolve('../js/case-toolkit.js'),'utf8'),{window,document:{createElement:()=>({}),getElementById:id=>id==='logChecklist'?null:get(id),querySelectorAll:()=>[]},CaseToolkitCore:T,CaseNotes:C,marked:{parse:text=>text}});
 window.CaseToolkit.init({current:()=>note,canEdit:()=>editable,mutate:f=>f(note),refreshEditors(){},save(){}});
 return {get,note,ui:window.CaseToolkit,readonly(){editable=false;window.CaseToolkit.setEditable(false);}};
}
test('inline issue selection records the issue type without editing notes',()=>{
 const h=setup();h.get('caseIssueType').value='network';h.get('caseIssueType').handlers.input();
 assert.equal(h.note.toolkit.issueType,'network');assert.equal(h.note.notes,'<p>Existing notes</p>');assert.equal(h.note.next,'<p>Existing plan</p>');
 assert.deepEqual(h.get('caseIssueType').children.map(o=>o.value),T.issueTypesFor(''));assert.ok(!T.issueTypesFor('').includes('fix ME OMSA'));
});
test('a custom issue type from a removed personal template stays selected',()=>{
 const h=setup();h.note.toolkit.issueType='custom-old';h.ui.refreshIssueTypes();
 assert.equal(h.get('caseIssueType').value,'custom-old');assert.match(h.get('caseIssueType').children.at(-1).textContent,/no longer available/);
});
test('the issue picker respects read-only state',()=>{
 const h=setup();h.readonly();assert.equal(h.get('caseIssueType').disabled,true);
});

test('the full issue type list shows on first render, without fix ME OMSA unless Systems Management is selected',()=>{
 const h=setup();h.ui.refresh();
 const values=()=>h.get('caseIssueType').children.map(o=>o.value);
 assert.ok(values().length>5);assert.ok(values().includes('hyperv'));assert.ok(!values().includes('fix ME OMSA'));
 assert.equal(h.get('productAppLabel').hidden,true);
 h.note.os='Systems Management';h.get('os').handlers.change();
 assert.deepEqual(values(),['fix ME OMSA']);assert.equal(h.note.toolkit.issueType,'fix ME OMSA');assert.equal(h.get('productAppLabel').hidden,false);
 h.note.toolkit.productApp='OMSA WOOT';h.note.os='Windows Server';h.get('os').handlers.change();
 assert.ok(!values().includes('fix ME OMSA'));assert.equal(h.note.toolkit.issueType,'general');assert.equal(h.note.toolkit.productApp,'');assert.equal(h.get('productAppLabel').hidden,true);
});
test('changing OS keeps an issue type that still applies and keeps custom ids',()=>{
 const h=setup();h.note.toolkit.issueType='network';h.note.os='Redhat';h.get('os').handlers.change();assert.equal(h.note.toolkit.issueType,'network');
 h.note.toolkit.issueType='custom-old';h.note.os='Systems Management';h.get('os').handlers.change();assert.equal(h.note.toolkit.issueType,'custom-old');
 assert.equal(h.get('caseIssueType').value,'custom-old');
});
test('VCF is no longer an OS/Solution option on either page',()=>{
 for(const page of ['../case-notes.html','../escalation-quality.html'])assert.ok(!fs.readFileSync(require.resolve(page),'utf8').includes('<option value="VCF">'),page);
});
