const test=require('node:test'),assert=require('node:assert/strict'),core=require('../js/log-helper-core.js');
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
function ui({failCopy=false,symptom='network'}={}) {
 const elements={}, node=()=>({value:'',textContent:'',innerHTML:'',children:[],listeners:{},options:[],attributes:{},setAttribute(k,v){this.attributes[k]=v},append(...items){this.children.push(...items)},replaceChildren(...items){this.children=items},addEventListener(k,f){this.listeners[k]=f},showModal(){this.open=true},close(){this.open=false;this.listeners.close?.()},focus(){},select(){}}),get=id=>elements[id]??=node();
 get('os').options=[{value:'Windows Server',textContent:'Windows Server'}];
 let copied='';const window={};
 const body={append(item){elements[item.id]=item;}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../js/log-helper.js'),'utf8'),{window,document:{body,getElementById:get,createElement:node},LogHelperCore:core,navigator:{clipboard:{async writeText(text){if(failCopy)throw Error();copied=text}}}});
 window.LogHelper.init({context:()=>({id:'one',os:'Windows Server',platform:'PowerEdge R750',symptom})});
 return {get,window,click:id=>get(id).listeners.click(),copied:()=>copied};
}
test('helper builds its own dialog and prefills OS and issue type from the page',()=>{
 const h=ui();
 assert.equal(h.get('logHelperDialog').attributes['aria-labelledby'],'logHelperTitle');
 assert.match(h.get('logHelperDialog').innerHTML,/Which logs should I collect\?/);
 h.click('openLogHelper');assert.equal(h.get('logHelperDialog').open,true);
 assert.equal(h.get('helperOS').value,'Windows Server');assert.equal(h.get('helperSymptom').value,'network');
 assert.match(flat(h.get('helperResults')),/Packet Monitor/);
 h.click('closeLogHelperBottom');assert.equal(h.get('logHelperDialog').open,false);
});
const flat=n=>[n.textContent||'',...(n.children||[]).map(flat)].join('\n');
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
 const C=require('../js/case-notes-core.js');
 for(const [symptom] of windowsCases){
  const state=C.empty(),note=C.create(state,'case',1000);note.os='Windows Server';note.toolkit.issueType=symptom;
  const restored=C.parse(C.backup(state,2000)).cases[0];
  assert.equal(restored.toolkit.issueType,symptom);
  assert.equal(core.plan({os:'Windows Server',symptom:C.escalation(restored,2000).issueType}).symptom,symptom);
 }
});
test('helper preselects every triage category and shows its tools in the plan',()=>{
 for(const [symptom,expected] of windowsCases){
  const h=ui({symptom});h.click('openLogHelper');
  assert.equal(h.get('helperSymptom').children.length,11);
  assert.equal(h.get('helperSymptom').value,symptom);
  assert.ok(flat(h.get('helperResults')).includes(expected),symptom+' plan shows '+expected);
 }
 const h=ui({symptom:'custom-example'});h.click('openLogHelper');
 assert.equal(h.get('helperSymptom').value,'general');
 assert.match(h.get('helperContext').textContent,/custom|Custom/);
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
test('Case Notes and Escalation Quality share one helper with identical behavior',()=>{
 for(const page of ['../case-notes.html','../escalation-quality.html']){
  const html=fs.readFileSync(require.resolve(page),'utf8');
  assert.ok(!html.includes('id="logHelperDialog"'),page+' has no copy of the dialog markup');
  assert.ok(!/id="helper(Add|Copy|OS|Symptom|Results)"/.test(html),page+' has no helper controls of its own');
  assert.match(html,/<script src="js\/log-helper-core\.js[^"]*" defer><\/script>/);assert.match(html,/<script src="js\/log-helper\.js[^"]*" defer><\/script>/);
  assert.match(html,/id="openLogHelper"/);assert.match(html,/<select id="os"/);
 }
 const versions=['../case-notes.html','../escalation-quality.html'].map(page=>/log-helper\.js\?v=([^"]+)"/.exec(fs.readFileSync(require.resolve(page),'utf8'))[1]);
 assert.equal(versions[0],versions[1],'both pages load the same helper version');
 for(const script of ['../js/case-notes.js','../js/app.js']){
  const init=/LogHelper\?\.init\(\{([\s\S]*?)\n\s*\}\);/.exec(fs.readFileSync(require.resolve(script),'utf8'))[1];
  assert.ok(!/canAdd|addLabel|add\(/.test(init),script+' passes only page context');
 }
 const markup=ui().window.LogHelper.markup;
 assert.ok(!/helperAdd|helperCopy/.test(markup));
});
