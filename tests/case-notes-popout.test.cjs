const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../js/case-notes-popout.js');
function setup({blocked=false,failSave=false,compact=false,opener=null}={}){
 const nodes={},classes=new Set(),events={};let releases=0,resumes=0,saves=0,opens=0,focused=0,closed=0;
 const node=id=>nodes[id]??={hidden:false,disabled:false,textContent:'',listeners:{},addEventListener(k,f){this.listeners[k]=f}};
 const child={closed:false,focus(){focused++},close(){this.closed=true}};
 const env={document:{getElementById:node,body:{classList:{toggle(k,v){v?classes.add(k):classes.delete(k)}}}},location:{href:'http://localhost/case-notes.html'+(compact?'?notesWindow=1&case=case-a':'')},history:{replaceState(){}},opener,open(){opens++;return blocked?null:child},close(){closed++},setInterval(f){events.poll=f;return 1},clearInterval(){delete events.poll},addEventListener(k,f){events[k]=f},URL};
 const api={current:()=>({id:'case-a',request:'SR-123'}),canEdit:()=>true,save(){saves++;return !failSave},suspend(){releases++},resume(){resumes++}};
 const ui=P.init(api,env);
 return {ui,node,child,env,classes,events,click:id=>node(id).listeners.click(),counts:()=>({releases,resumes,saves,opens,focused,closed})};
}
test('popout saves before handing off edit ownership and reuses its open window',()=>{
 const h=setup();h.click('popoutNotes');assert.equal(h.counts().releases,1);assert.equal(h.counts().saves,1);
 h.click('popoutNotes');assert.equal(h.counts().opens,1);assert.equal(h.counts().focused,1);
 h.child.closed=true;h.events.poll();assert.equal(h.counts().resumes,1);
});
test('blocked popups and failed saves never release the editor lock',()=>{
 const h=setup({blocked:true});h.click('popoutNotes');assert.equal(h.counts().releases,0);assert.equal(h.node('compactNotesFallback').hidden,false);
 h.click('compactNotesFallback');assert.ok(h.classes.has('notes-compact'));
 const failed=setup({failSave:true});failed.click('popoutNotes');assert.equal(failed.counts().releases,0);assert.equal(failed.child.closed,true);
});
test('compact view identifies the case and returns to opener only after saving',()=>{
 let focused=0;const h=setup({compact:true,opener:{closed:false,focus(){focused++}}});
 assert.ok(h.classes.has('notes-compact'));assert.equal(h.ui.caseId,'case-a');assert.match(h.node('compactCaseTitle').textContent,/SR-123/);
 h.click('returnToCase');assert.equal(focused,1);assert.equal(h.counts().closed,1);
 const failed=setup({compact:true,failSave:true,opener:{closed:false,focus(){}}});failed.click('returnToCase');assert.equal(failed.counts().closed,0);
});
test('orphaned popout returns to full workspace without losing its editor',()=>{
 const h=setup({compact:true});h.click('returnToCase');assert.ok(!h.classes.has('notes-compact'));assert.equal(h.counts().closed,0);assert.equal(h.counts().releases,0);
});
test('an unavailable requested case can return to the full workspace and reacquire editing',()=>{
 const h=setup({compact:true});h.ui.unavailable();h.click('returnToCase');
 assert.equal(h.ui.caseId,null);assert.equal(h.counts().resumes,1);
});
