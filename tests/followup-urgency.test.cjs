const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const T=require('../js/case-toolkit-core.js'),C=require('../js/case-notes-core.js');
const hour=3600000,now=Date.parse('2026-10-05T12:00:00Z');
const withDue=(offset,status='Open')=>{const note={};T.ensure(note).due=new Date(now+offset).toISOString();note.toolkit.status=status;return note;};
test('follow-ups are overdue (red) after the due time and due soon (yellow) within 4 hours',()=>{
 assert.equal(T.followupState(withDue(-1),now),'overdue');
 assert.equal(T.followupState(withDue(0),now),'soon');
 assert.equal(T.followupState(withDue(4*hour),now),'soon');
 assert.equal(T.followupState(withDue(4*hour+1),now),'');
 assert.equal(T.followupState(withDue(-hour,'Completed'),now),'','completed cases are never highlighted');
 assert.equal(T.followupState(withDue(hour,'Completed'),now),'');
 assert.equal(T.followupState({},now),'');
});
test('marking a follow-up done records it, clears the due date, and either keeps the case open or completes it',()=>{
 const again=withDue(-hour,'Waiting on customer');
 assert.equal(T.completeFollowup(again,now,'new'),true);
 assert.equal(again.toolkit.due,'');assert.equal(again.toolkit.status,'Waiting on customer');
 assert.equal(T.lastFollowup(again).result,'New follow-up needed');assert.equal(T.lastFollowup(again).at,now);
 const done=withDue(hour);T.completeFollowup(done,now,'complete');
 assert.equal(done.toolkit.status,'Completed');assert.equal(done.toolkit.due,'');assert.equal(T.lastFollowup(done).result,'Case marked Completed');
 assert.equal(T.completeFollowup(done,now,'new'),false,'nothing to mark done without a due date');
 assert.equal(T.completeFollowup(withDue(hour),now,'maybe'),false);
 const none=withDue(-hour,'In progress');T.completeFollowup(none,now,'none');
 assert.equal(none.toolkit.due,'');assert.equal(none.toolkit.status,'In progress','No follow-up leaves the case open as it was');
 assert.equal(T.lastFollowup(none).result,'No further follow-up');assert.equal(T.followupState(none,now),'','no longer highlighted');
});
test('a recorded follow-up survives backup and restore',()=>{
 const state=C.empty(),note=C.create(state,'a',1000);T.ensure(note).due=new Date(now).toISOString();T.completeFollowup(note,now,'new');
 const restored=C.parse(C.backup(state,2000)).cases[0];assert.equal(T.lastFollowup(restored).result,'New follow-up needed');
});
test('Case Notes colors cards, offers a due-soon filter and a Follow-up done action that asks what is next',()=>{
 const html=fs.readFileSync(require.resolve('../case-notes.html'),'utf8'),notes=fs.readFileSync(require.resolve('../js/case-history-list.js'),'utf8'),kit=fs.readFileSync(require.resolve('../js/case-toolkit.js'),'utf8'),css=fs.readFileSync(require.resolve('../css/case-notes.css'),'utf8');
 assert.match(html,/<option value="soon">Follow-ups due within 4 hours<\/option>/);
 assert.match(html,/id="followupDone" type="button" disabled>Mark follow-up done</);
 assert.match(notes,/classList\.toggle\("followup-" \+ followup, true\)/);assert.match(notes,/addAction\("Follow-up done"/);
 assert.match(kit,/Is another follow-up needed, or is the case complete\?/);assert.match(kit,/"Case is complete"/);assert.match(kit,/\{label:"No follow-up",value:"none"\}/);assert.ok(!/label:"Cancel"/.test(kit),'No follow-up replaces Cancel');assert.match(kit,/"Schedule a new follow-up"/);
 assert.match(css,/\.case-item\.followup-overdue \{[^}]*#d92d20/);assert.match(css,/\.case-item\.followup-soon \{[^}]*#e3a008/);
});
test('Set follow-up reads Update follow-up while a follow-up is scheduled',()=>{
 const vm=require('node:vm'),els={},el=()=>({value:'',textContent:'',title:'',disabled:false,hidden:false,listeners:{},addEventListener(k,f){this.listeners[k]=f},replaceChildren(){},append(){},focus(){}});
 const get=id=>els[id]??=el(),buttons=[el(),el()];buttons.forEach(b=>{b.textContent='Set follow-up';b.dataset={toolkit:'followup'};});
 const note={os:''};T.ensure(note);
 const ctx={window:{},CaseToolkitCore:T,document:{getElementById:get,createElement:el,querySelectorAll:sel=>sel==='[data-toolkit="followup"]'||sel==='[data-toolkit]'?buttons:[]}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../js/case-toolkit.js'),'utf8'),ctx);
 const K=ctx.window.CaseToolkit;K.init({current:()=>note,canEdit:()=>true,save(){},mutate(f){f(note);},ask:async()=>null});
 K.refresh();assert.deepEqual(buttons.map(b=>b.textContent),['Set follow-up','Set follow-up']);
 note.toolkit.due=new Date(now).toISOString();K.refresh();assert.deepEqual(buttons.map(b=>b.textContent),['Update follow-up','Update follow-up']);
 note.toolkit.status='Completed';K.refresh();assert.equal(buttons[0].textContent,'Set follow-up','completed cases go back to Set follow-up');
 note.toolkit.status='Open';note.toolkit.due='';K.refresh();assert.equal(buttons[1].textContent,'Set follow-up');
});
