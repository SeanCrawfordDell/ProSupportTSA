const test=require('node:test'),assert=require('node:assert/strict'),core=require('../log-helper-core.js');
test('all supported solutions and symptoms produce explained, linked collection plans',()=>{
 for(const os of Object.keys(core.guides))for(const symptom of Object.keys(core.symptoms)){
  const plan=core.plan({os,symptom});assert.ok(plan.items.length>=3);assert.ok(plan.items.some(item=>item.url.startsWith('https://')));assert.ok(plan.items.every(item=>item.title&&item.how&&item.why));assert.match(core.text(plan),/not yet collected/);
 }
});
test('PowerEdge hardware collection is conditional and Windows scenarios choose targeted evidence',()=>{
 assert.ok(core.plan({platform:'PowerEdge R750'}).items.some(i=>i.title.includes('TSR')));
 assert.ok(!core.plan({platform:'Other virtual machine'}).items.some(i=>i.title.includes('TSR')));
 assert.ok(core.plan({os:'Windows Server',symptom:'network'}).items.some(i=>i.title.includes('Packet Monitor')));
 assert.ok(!core.plan({os:'Redhat',symptom:'network'}).items.some(i=>i.title.includes('Packet Monitor')));
});
test('unavailable hosts defer host collection; unknown solutions use a safe fallback',()=>{
 const offline=core.plan({os:'Windows Server',symptom:'performance',reachable:false});assert.match(offline.items[1].how,/after access is restored/);assert.ok(!offline.items.some(i=>i.title==='Performance Monitor capture'));
 const unknown=core.plan({os:'Custom OS',symptom:'unsupported'});assert.equal(unknown.symptom,'general');assert.ok(unknown.items.some(i=>i.title==='Identify the affected product'));
});
const vm=require('node:vm'),fs=require('node:fs');
function ui({canAdd=true,failCopy=false,saveResult=true,symptom='network'}={}) {
 const elements={}, node=()=>({value:'',textContent:'',children:[],listeners:{},options:[],append(...items){this.children.push(...items)},replaceChildren(...items){this.children=items},addEventListener(k,f){this.listeners[k]=f},showModal(){this.open=true},close(){this.open=false;this.listeners.close?.()},focus(){},select(){}}),get=id=>elements[id]??=node();
 get('os').options=[{value:'Windows Server',textContent:'Windows Server'}];
 let id='one',adds=0,copied='';const window={};
 vm.runInNewContext(fs.readFileSync(require.resolve('../log-helper.js'),'utf8'),{window,document:{getElementById:get,createElement:node},LogHelperCore:core,navigator:{clipboard:{async writeText(text){if(failCopy)throw Error();copied=text}}}});
 window.LogHelper.init({context:()=>({id,os:'Windows Server',platform:'PowerEdge R750',symptom}),canAdd:()=>canAdd,addLabel:'Add plan',add(){adds++;return saveResult}});
 return {get,click:id=>get(id).listeners.click(),adds:()=>adds,copied:()=>copied,setId:value=>id=value};
}
test('helper prefills context, appends once, and blocks mutation if the selected case changes',()=>{
 const h=ui();h.click('openLogHelper');assert.equal(h.get('helperOS').value,'Windows Server');assert.equal(h.get('helperSymptom').value,'network');h.click('helperAdd');h.click('helperAdd');assert.equal(h.adds(),1);
 h.click('openLogHelper');h.setId('two');h.click('helperAdd');assert.equal(h.adds(),1);assert.match(h.get('helperStatus').textContent,/case changed/);
 const ro=ui({canAdd:false});ro.click('openLogHelper');assert.equal(ro.get('helperAdd').disabled,true);ro.click('helperAdd');assert.equal(ro.adds(),0);
});
const windowsCases=[['boot','Boot'],['crash','dump'],['performance','Performance Monitor'],['network','Packet Monitor'],['storage','Get-Disk'],['directory','repadmin'],['hyperv','Get-VM'],['cluster','Get-ClusterLog'],['updates','Get-WindowsUpdateLog'],['smb','Get-SmbShare']];
test('each Windows issue routes to targeted tools with location and precautions in the exported plan',()=>{
 for(const [symptom,expected] of windowsCases){
  const plan=core.plan({os:'Windows Server',symptom});
  assert.equal(plan.symptom,symptom);
  assert.ok(plan.items.some(i=>i.where && i.caution),symptom+' needs collection instructions');
  assert.ok(core.text(plan).includes(expected),symptom+' missing its tool');
  assert.match(core.text(plan),/Where:.*\nPrecautions:/);
 }
});
test('Windows commands are excluded on other platforms and unavailable hosts',()=>{
 for(const [symptom] of windowsCases){
  for(const context of [{os:'Redhat'},{os:'Windows Server',reachable:false}]){
   assert.ok(core.plan({...context,symptom}).items.every(i=>!i.command));
  }
 }
 assert.equal(core.plan({os:'Windows Server',symptom:'custom-my-template'}).symptom,'general');
});
test('new issue types survive case backup and structured escalation handoff',()=>{
 const C=require('../case-notes-core.js');
 for(const [symptom] of windowsCases){
  const state=C.empty(),note=C.create(state,'case',1000);note.os='Windows Server';note.toolkit.issueType=symptom;
  const restored=C.parse(C.backup(state,2000)).cases[0];
  assert.equal(restored.toolkit.issueType,symptom);
  assert.equal(core.plan({os:'Windows Server',symptom:C.escalation(restored,2000).issueType}).symptom,symptom);
 }
});
test('helper preselects every triage category and renders its commands for copying',async()=>{
 for(const [symptom,expected] of windowsCases){
  const h=ui({symptom});h.click('openLogHelper');
  assert.equal(h.get('helperSymptom').children.length,11);
  assert.equal(h.get('helperSymptom').value,symptom);
  await h.click('helperCopy');assert.ok(h.copied().includes(expected));
 }
 const h=ui({symptom:'custom-example'});h.click('openLogHelper');
 assert.equal(h.get('helperSymptom').value,'general');
 assert.match(h.get('helperContext').textContent,/custom|Custom/);
});
test('helper copy failure exposes a manual fallback; failed saves never claim success',async()=>{
 const h=ui({failCopy:true,saveResult:false});h.click('openLogHelper');await h.click('helperCopy');assert.equal(h.get('helperPlain').open,true);assert.match(h.get('helperStatus').textContent,/Copy failed/);h.click('helperAdd');assert.match(h.get('helperStatus').textContent,/saving failed/);
 const ok=ui();ok.click('openLogHelper');await ok.click('helperCopy');assert.match(ok.copied(),/LOG COLLECTION PLAN/);
});
test('per-tool command copy exports only the command and reports clipboard failure',async()=>{
 for(const failCopy of [false,true]){
  const h=ui({symptom:'cluster',failCopy});h.click('openLogHelper');
  const card=h.get('helperResults').children.find(n=>n.children.some(c=>c.textContent==='Get-ClusterLog collection'));
  const copy=card.children.find(n=>n.textContent==='Copy commands');
  await copy.listeners.click();
  if(failCopy)assert.match(h.get('helperStatus').textContent,/Copy failed/);
  else assert.equal(h.copied(),'Get-ClusterLog -TimeSpan 30 -UseLocalTime -Destination .');
 }
});
test('Case Notes shows the plan without an add button',()=>{
 const html=fs.readFileSync(require.resolve('../case-notes.html'),'utf8'),js=fs.readFileSync(require.resolve('../case-notes.js'),'utf8');
 assert.ok(!html.includes('id="helperAdd"'));assert.ok(!html.includes('Add to Next Steps'));assert.ok(!/addLabel/.test(js));
 const elements={},node=()=>({value:'',textContent:'',children:[],listeners:{},options:[],append(...items){this.children.push(...items)},replaceChildren(...items){this.children=items},addEventListener(k,f){this.listeners[k]=f},showModal(){this.open=true},close(){this.open=false},focus(){},select(){}});
 const get=id=>id==='helperAdd'?null:(elements[id]??=node());get('os').options=[{value:'Windows Server',textContent:'Windows Server'}];
 const window={};
 vm.runInNewContext(fs.readFileSync(require.resolve('../log-helper.js'),'utf8'),{window,document:{getElementById:get,createElement:node},LogHelperCore:core,navigator:{clipboard:{async writeText(){}}}});
 window.LogHelper.init({context:()=>({id:'one',os:'Windows Server',platform:'PowerEdge R750',symptom:'network'})});
 get('openLogHelper').listeners.click();
 assert.equal(get('logHelperDialog').open,true);assert.match(get('helperPlanText').value,/Packet Monitor/);
});
