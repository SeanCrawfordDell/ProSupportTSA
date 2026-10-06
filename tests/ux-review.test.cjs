const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../js/case-notes-core.js'),T=require('../js/case-toolkit-core.js');
const day=(d,h)=>Date.parse(`2026-10-0${d}T${String(h).padStart(2,'0')}:00:00`);

test('Copy to Lightning text holds only the selected day; the full copy holds every day',()=>{
 const state=C.empty(),note=C.create(state,'a',day(1,9));note.notes='DAY ONE';
 C.addEntry(note,'b',day(2,9));note.notes='DAY TWO MORNING';
 C.addEntry(note,'c',day(2,15));note.notes='DAY TWO AFTERNOON';
 const today=C.dayCopyText(note,day(2,16));
 assert.ok(today.includes('DAY TWO MORNING')&&today.includes('DAY TWO AFTERNOON'),'every note from that day');
 assert.ok(!today.includes('DAY ONE'),'earlier days are left out');
 assert.ok(C.copyText(note,day(2,16)).includes('DAY ONE'),'the full copy keeps the whole history');
 C.selectEntry(note,'initial-a');const first=C.dayCopyText(note,day(2,16));
 assert.ok(first.includes('DAY ONE')&&!first.includes('DAY TWO'),'follows the selected note');
 assert.match(today,/Service Request Number:/,'case fields are still included');
});
test('Case Notes copies the day for Lightning and offers Copy case summary for the whole case',()=>{
 const js=fs.readFileSync(require.resolve('../js/case-notes.js'),'utf8');
 assert.match(/\$\("copyNote"\)\.addEventListener[\s\S]*?finally/.exec(js)[0],/CaseNotes\.dayCopyText\(/);
 const summary=/function renderCaseSummary[\s\S]*?\n  \}\n/.exec(js)[0];
 assert.match(summary,/Copy case summary/);assert.match(summary,/CaseNotes\.copyText\(current/);assert.ok(!/CaseNotes\.stop\(/.test(summary),'the summary copy leaves the timer alone');
});

// A small DOM for the assist module.
function dom(){
 const els={},listeners={},nodes=[];
 const el=(id)=>{const n={id,hidden:false,textContent:'',title:'',checked:false,value:'',attributes:{},listeners:{},classes:new Set(),children:[],
  classList:{toggle:(c,on)=>on?n.classes.add(c):n.classes.delete(c),contains:c=>n.classes.has(c)},
  setAttribute(k,v){n.attributes[k]=v;},addEventListener(k,f){n.listeners[k]=f;},focus(){},scrollIntoView(){},click(){n.listeners.click?.();},
  closest(){return n.row||null;},replaceChildren(...c){n.children=c;},append(...c){n.children.push(...c);},
  before(other){n.moved=['before',other.id];},after(other){n.moved=['after',other.id];}};return n;};
 const get=id=>els[id]??=el(id);
 const document={title:'Case Notes · Dell Pro-Support',getElementById:get,querySelector:()=>null,createElement:()=>el(),addEventListener(k,f){listeners[k]=f;}};
 return {get,document,listeners};
}
function load({cases=[],all,notification,idle,storage={}}={}){
 const d=dom(),store=new Map(Object.entries(storage)),sent=[],asked=[],opened=[];
 const ctx={window:{},document:d.document,CaseToolkitCore:T,localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},AbortController,
  ...(notification?{Notification:Object.assign(function(title,options){sent.push({title,...options});this.close=()=>{};},notification)}:{}),
  ...(idle?{IdleDetector:idle}:{})};
 vm.runInNewContext(fs.readFileSync(require.resolve('../js/case-notes-assist.js'),'utf8'),ctx);
 let discarded=null,running=true,answer='discard';
 const a=ctx.window.CaseNotesAssist.init({cases:()=>cases,allCases:()=>all||cases.map(note=>({note,collection:'cases'})),selected:()=>cases[0],
  ask:async q=>{asked.push(q);return answer;},backup(){},timerRunning:()=>running,discardTime:(f,t)=>discarded=[f,t],open:(id,c)=>opened.push([id,c]),showFollowups:f=>opened.push(['filter',f])});
 return {a,d,ctx,store,sent,asked,opened,get:d.get,discarded:()=>discarded,setRunning:v=>running=v,setAnswer:v=>answer=v};
}
const withDue=(id,offset,extra={})=>{const note={id,created:Date.now(),request:'',...extra};T.ensure(note).due=new Date(Date.now()+offset).toISOString();return note;};

test('follow-up alerts count overdue and due-soon cases in the tab title and the header pill',()=>{
 const h=load({cases:[withDue('a',-60000),withDue('b',3600000),withDue('c',86400000)]});
 assert.equal(h.d.document.title,'(2) Case Notes · Dell Pro-Support');
 assert.equal(h.get('followupAlert').hidden,false);assert.equal(h.get('followupAlert').textContent,'1 overdue · 1 due within 4 hours');
 assert.ok(h.get('followupAlert').classes.has('overdue'));
 h.get('followupAlert').listeners.click();assert.deepEqual(h.opened.at(-1),['filter','overdue']);
 const calm=load({cases:[withDue('c',86400000)]});assert.equal(calm.d.document.title,'Case Notes · Dell Pro-Support');assert.equal(calm.get('followupAlert').hidden,true);
});
test('desktop notifications are opt-in and announce each follow-up state once',()=>{
 const cases=[withDue('a',-60000,{request:'111111'}),withDue('b',3600000)];
 const off=load({cases,notification:{permission:'granted'}});assert.equal(off.sent.length,0,'off by default');
 const on=load({cases,notification:{permission:'granted'},storage:{'dell-support.followup-notify':'true'}});
 assert.deepEqual(on.sent.map(n=>n.title),['Follow-up overdue: 111111','Follow-up due soon: A case']);
 on.a.refresh();assert.equal(on.sent.length,2,'not repeated on the next refresh');
});
test('a duplicate Service Request number is flagged with a link to the other case',()=>{
 const mine={id:'m',created:1,request:'1234 5678'},other={id:'o',created:2,request:'12345678'};
 const h=load({cases:[mine],all:[{note:mine,collection:'cases'},{note:other,collection:'archive'}]});
 h.a.refresh();assert.equal(h.get('requestDuplicate').hidden,false);assert.match(h.get('requestDuplicateText').textContent,/already used by another case \(Archive/);
 h.get('openDuplicate').onclick();assert.deepEqual(h.opened.at(-1),['o','archive']);
 mine.request='999';h.a.refresh();assert.equal(h.get('requestDuplicate').hidden,true);
});
test('Alt+Shift shortcuts press the matching buttons, except while a dialog is open',()=>{
 const h=load();let prevented=0;const key=code=>h.d.listeners.keydown({altKey:true,shiftKey:true,code,preventDefault(){prevented++;}});
 for(const [code,id] of [['KeyC','copyNote'],['KeyN','newCaseEntry'],['KeyK','newNote']]){let pressed=0;h.get(id).listeners.click=()=>pressed++;key(code);assert.equal(pressed,1,code);}
 assert.equal(prevented,3);
 h.d.listeners.keydown({altKey:false,shiftKey:true,code:'KeyC',preventDefault(){prevented++;}});assert.equal(prevented,3,'plain Shift+C is typing');
 assert.equal(h.get('copyNote').attributes['aria-keyshortcuts'],'Alt+Shift+C');
});
test('Notes first moves Notes and Action Plan above Case workflow and Case Details',()=>{
 const h=load({storage:{'dell-support.notes-first':'true'}});
 // The fake records which element was placed where: plan.after(details) puts Case Details after the Action Plan.
 assert.deepEqual(h.get('actionPlanSection').moved,['after','caseDetailsSection']);assert.deepEqual(h.get('noteForm').moved,['after','workflow']);
 h.a.setNotesFirst(false);assert.deepEqual(h.get('notesSection').moved,['before','caseDetailsSection']);assert.deepEqual(h.get('noteForm').moved,['before','workflow']);
});
test('coming back after being away offers to remove the away time from a running timer',async()=>{
 let detector;class Idle{constructor(){detector=this;this.userState='active';this.screenState='unlocked';}addEventListener(k,f){this.change=f;}async start(){}static async requestPermission(){return 'granted';}}
 const h=load({idle:Idle,storage:{'dell-support.idle-prompt':'true'}});await new Promise(r=>setImmediate(r));
 detector.userState='idle';await detector.change();
 detector.userState='active';await detector.change();
 assert.equal(h.asked.length,1);assert.match(h.asked[0].message,/away for about 15 minutes/);
 const [from,to]=h.discarded();assert.ok(to-from>=15*60000-1000,'removes the time since the computer went idle');
 h.setRunning(false);detector.userState='idle';await detector.change();detector.userState='active';await detector.change();
 assert.equal(h.asked.length,1,'no prompt when the timer was not running');
});
test('new preferences are backed up and validated',()=>{
 const S=require('../js/case-settings-core.js');
 const values={'dell-support.notes-first':'true','dell-support.idle-prompt':'false','dell-support.followup-notify':'true'};
 const captured=S.capture({getItem:k=>values[k]??null});
 assert.equal(captured.notesFirst,'true');assert.equal(captured.followupNotify,'true');
 const restored=S.validate({fieldConfig:C.empty().fieldConfig,preferences:captured},C.fields).values;
 assert.equal(restored['dell-support.notes-first'],'true');
 assert.throws(()=>S.validate({fieldConfig:C.empty().fieldConfig,preferences:{idlePrompt:'maybe'}},C.fields));
});
test('a read-only tab waits for the editor lock and can take over editing',()=>{
 const js=fs.readFileSync(require.resolve('../js/case-notes.js'),'utf8'),html=fs.readFileSync(require.resolve('../case-notes.html'),'utf8');
 assert.match(html,/id="takeOverEditing" type="button" hidden>Take over editing here</);
 assert.match(js,/navigator\.locks\.request\(lockName, \{ signal: wait\.signal \}/,'waits in line instead of giving up');
 assert.match(js,/navigator\.locks\.request\(lockName, \{ steal: true \}/,'Take over editing steals the lock');
 assert.match(js,/postMessage\("save-now"\)/,'the editing tab is asked to save first');
});
test('the slim action bar keeps AI tools behind a toggle and puts Copy to Lightning first',()=>{
 const html=fs.readFileSync(require.resolve('../case-notes.html'),'utf8'),css=fs.readFileSync(require.resolve('../css/case-notes.css'),'utf8');
 assert.match(html,/id="toggleAiTools" type="button" aria-expanded="false" aria-controls="aiToolsPanel"/);assert.match(html,/<div class="devin-copy" id="aiToolsPanel" hidden>/);
 assert.match(css,/#copyNote \{ order:-3; \}/);assert.match(css,/\.copy-actions #copyNote, \[data-theme="dark"\] \.copy-actions #copyNote \{ background:var\(--blue\)/);
 assert.match(html,/id="searchEverywhere"/);assert.match(html,/id="toggleHistoryFilters"/);assert.match(html,/<div id="historyFilters" class="history-filters" hidden>/);
});
