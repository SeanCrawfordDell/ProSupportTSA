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
test('inline issue selection chooses a template without editing notes until applied',()=>{
 const h=setup();h.get('caseIssueType').value='network';h.get('caseIssueType').handlers.input();
 assert.equal(h.note.toolkit.issueType,'network');assert.equal(h.note.notes,'<p>Existing notes</p>');
 h.get('applyTemplate').handlers.click();assert.ok(h.note.notes.startsWith('<p>Existing notes</p>'));assert.ok(h.note.notes.includes(T.templateHtml('network')));
 assert.ok(h.note.next.startsWith('<p>Existing plan</p>'));
});
test('inline template controls respect read-only state',()=>{
 const h=setup();h.readonly();assert.equal(h.get('caseIssueType').disabled,true);assert.equal(h.get('applyTemplate').disabled,true);
 h.get('applyTemplate').handlers.click();assert.equal(h.note.notes,'<p>Existing notes</p>');
});
