// When stored history cannot be read: CaseNotes.repair() salvages what is valid, and the recovery panel
// (js/case-recovery.js) always downloads the original and asks again before changing anything.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../js/case-notes-core.js');
const key='dell-support.case-notes.v1';
function history(){
 const s=C.empty();
 for(const [id,tag,day] of [['a','GOOD001',1],['b','BROKEN1',2],['c','GOOD002',3]]){const n=C.create(s,id,Date.parse(`2026-10-0${day}T09:00:00Z`));n.tag=tag;n.request='10000000'+day;}
 return s;
}
test('repair keeps every valid case and sets aside only the damaged one, with its reason',()=>{
 const s=history();s.cases.find(n=>n.id==='b').toolkit.status='Nonsense';
 const raw=JSON.stringify(s);assert.throws(()=>C.parse(raw),/toolkit/);
 const r=C.repair(raw,Date.now());
 assert.equal(r.kept,2);assert.deepEqual(r.state.cases.map(n=>n.tag).sort(),['GOOD001','GOOD002']);
 assert.equal(r.setAside.length,1);assert.match(r.setAside[0].name,/BROKEN1/);assert.match(r.setAside[0].reason,/toolkit/);
 assert.equal(r.setAside[0].data.id,'b','the damaged case is returned whole');
 assert.equal(C.parse(JSON.stringify(r.state)).cases.length,2,'the result loads');
});
test('repair resolves duplicate IDs, extra running timers, over 100 cases and bad saved versions',()=>{
 const s=history();
 s.cases.push(JSON.parse(JSON.stringify(s.cases[0])));
 s.cases.forEach(n=>{n.started=Date.parse('2026-10-03T10:00:00Z');});
 for(let i=0;i<100;i++){const n=JSON.parse(JSON.stringify(s.cases[1]));n.id='bulk-'+i;n.activeEntryId='initial-bulk-'+i;n.entries[0].id='initial-bulk-'+i;n.created=1000+i;n.started=null;s.cases.push(n);}
 s.revisions={a:[{savedAt:5,note:{id:'a'}}],ghost:[{savedAt:6,note:{id:'ghost'}}]};
 const r=C.repair(JSON.stringify(s),Date.parse('2026-10-03T11:00:00Z'));
 assert.equal(r.state.cases.length,100);assert.ok(r.state.archive.length>=3,'the oldest extras move to the Archive');
 assert.equal([...r.state.cases,...r.state.archive].filter(n=>n.started!==null).length,1,'only one case keeps timing');
 assert.ok(r.setAside.some(x=>x.reason==='Duplicate case ID'));
 assert.ok(r.setAside.some(x=>x.where==='Saved versions'&&x.name==='ghost'));
 assert.ok(!r.state.revisions.a,'an invalid saved version is dropped');
});
test('repair sets aside broken field settings but keeps the cases, and declines what it cannot read',()=>{
 const s=history();s.fieldConfig.order=['tag','tag'];
 const r=C.repair(JSON.stringify(s),Date.now());
 assert.equal(r.kept,3);assert.equal(r.setAside[0].where,'Case Details field settings');
 assert.equal(C.repair('{not json',1),null);
 assert.equal(C.repair(JSON.stringify({version:9,cases:[]}),1),null,'saved by a newer version');
 assert.equal(C.repair('[]',1),null);
});
// A small DOM for the recovery panel.
function page(stored){
 const els={},store=new Map(stored===null?[]:[[key,stored]]),downloads=[],reopened=[];
 const el=id=>els[id]??={id,hidden:false,textContent:'',children:[],listeners:{},
  addEventListener(k,f){this.listeners[k]=f},replaceChildren(...c){this.children=c},append(...c){this.children.push(...c)},focus(){},click(){this.listeners.click?.()}};
 const document={getElementById:el,createElement:tag=>({tag,textContent:'',click(){if(this.download)downloads.push(this.download)},remove(){}}),body:{append(){}}};
 const localStorage={getItem(k){return store.has(k)?store.get(k):null},setItem(k,v){store.set(k,v)},removeItem(k){store.delete(k)}};
 const ctx={window:{},document,localStorage,CaseNotes:C,URL:{createObjectURL:()=>'blob:x',revokeObjectURL(){}},Blob:class{},setTimeout:()=>0,Date,JSON,Number};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../js/case-recovery.js'),'utf8'),ctx);
 const R=ctx.window.CaseRecovery;R.init({key,reopen:m=>reopened.push(m)});
 return {R,el,store,downloads,reopened};
}
test('the recovery panel explains the problem, downloads a copy, and repairs only after a second confirmation',()=>{
 const s=history();s.cases.find(n=>n.id==='b').toolkit.status='Nonsense';const raw=JSON.stringify(s);
 const p=page(raw);let error;try{C.parse(raw)}catch(e){error=e}
 p.R.show(error,raw);
 assert.equal(p.el('recoveryPanel').hidden,false);
 assert.match(p.el('recoveryReason').textContent,/Invalid case toolkit data.*nothing has been deleted/);
 assert.match(p.el('recoverySummary').textContent,/Repair keeps 2 cases\. This item cannot be loaded/);
 assert.equal(p.el('recoverySetAside').children.length,1);
 p.el('recoveryRepair').click();
 assert.equal(p.downloads.length,1,'the original is downloaded first');assert.match(p.downloads[0],/^case-notes-history-copy-.*\.json$/);
 assert.equal(p.store.get(key),raw,'nothing changes before the second confirmation');
 assert.equal(p.el('recoveryConfirm').hidden,false);
 p.el('recoveryConfirmGo').click();
 assert.equal(C.parse(p.store.get(key)).cases.length,2);assert.equal(p.el('recoveryPanel').hidden,true);
 assert.match(p.reopened[0],/repaired: 2 cases kept/);
});
test('the recovery panel refuses to overwrite history changed in another tab, and Cancel changes nothing',()=>{
 const s=history();s.cases[0].toolkit.status='Nonsense';const raw=JSON.stringify(s);
 const p=page(raw);p.R.show(Error('Invalid case toolkit data'),raw);
 p.el('recoveryRepair').click();p.el('recoveryConfirmCancel').click();
 assert.equal(p.store.get(key),raw);assert.match(p.el('recoveryStatus').textContent,/Nothing was changed/);
 p.el('recoveryRepair').click();p.store.set(key,'{"changed":true}');p.el('recoveryConfirmGo').click();
 assert.equal(p.store.get(key),'{"changed":true}');assert.match(p.el('recoveryStatus').textContent,/changed in another tab/);
});
test('start fresh downloads a copy and clears history only after confirmation; unrepairable data offers no repair',()=>{
 const p=page('{not json');p.R.show(Error('Unexpected token'),'{not json');
 assert.equal(p.el('recoveryRepair').hidden,true);assert.match(p.el('recoverySummary').textContent,/cannot be repaired automatically/);
 p.el('recoveryFresh').click();assert.equal(p.downloads.length,1);assert.equal(p.store.get(key),'{not json');
 p.el('recoveryConfirmGo').click();assert.equal(p.store.has(key),false);assert.match(p.reopened[0],/Started fresh/);
});
test('blocked storage and newer-version history get specific guidance instead of repair',()=>{
 const blocked=page(null);blocked.R.show(Object.assign(Error('denied'),{name:'SecurityError'}),undefined);
 assert.match(blocked.el('recoveryReason').textContent,/blocking site storage/);
 assert.ok(['recoveryRepair','recoveryDownload','recoveryFresh'].every(id=>blocked.el(id).hidden));
 const newer=page('{"version":9,"cases":[]}');newer.R.show(Error('Invalid history'),'{"version":9,"cases":[]}');
 assert.match(newer.el('recoverySummary').textContent,/newer version.*Ctrl\+F5/);assert.equal(newer.el('recoveryRepair').hidden,true);
});
