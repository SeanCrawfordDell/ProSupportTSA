const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const core=require('../case-notes-core.js');
test('Devin escalation snapshot uses latest facts and cannot append notes',()=>{
 const h=harness({aiIntegration:true});h.get('problem').value='Management UI timeout';
 assert.ok(h.ctx.ai);const shot=h.ctx.ai.snapshot();assert.equal(shot.caseId,null);assert.match(shot.prompt,/Management UI timeout/);
 assert.equal(h.ctx.ai.appendResponse,undefined);
});
function harness({stored=null,failStorage=false,failClipboard=false,imported=null,aiIntegration=false}={}) {
 const nodes={}, listeners={},timers=[];let copied='',writes=0,confirmAnswer=true;
 class Element {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.value='';this.textContent='';this.children=[];this.listeners={};this.attributes={};this.hidden=false;this.style={};this.options=[];this.classList={add(){},remove(){},toggle(){}};}
  append(...items){for(const item of items){if(typeof item==='object'){item.parent=this;if(item.tagName==='OPTION')this.options.push(item);}this.children.push(item)}}
  appendChild(item){this.append(item);return item}
  replaceChildren(...items){this.children=[];this.append(...items)}
  after(item){if(item.id)nodes[item.id]=item;this.parent?.append(item)}
  remove(){if(this.id)delete nodes[this.id]}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn)}
  setAttribute(k,v){this.attributes[k]=v} removeAttribute(k){delete this.attributes[k]}
  focus(){this.focused=true} scrollIntoView(){} select(){this.selected=true}
  querySelector(selector){return this.children.flatMap(child=>typeof child==='object'?[child,...child.children.filter(c=>typeof c==='object')]:[]).find(child=>selector==='textarea'?child.tagName==='TEXTAREA':child.className===selector.slice(1))}
 }
 const get=id=>nodes[id]??=Object.assign(new Element(),{id});
 const html=fs.readFileSync(require.resolve('../escalation-quality.html'),'utf8');
 for(const [whole,tag,id]of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"[^>]*>/g)){const node=get(id);node.tagName=tag.toUpperCase();const type=/\btype="([^"]+)"/.exec(whole)?.[1];if(type){node.type=type;node.checked=false;}if(/\shidden[\s>]/.test(whole))node.hidden=true;}
 get('reviewState').hidden=true;
 const storage={getItem(){if(failStorage)throw Error('blocked');return stored},setItem(k,v){if(failStorage)throw Error('quota');stored=v;writes++}};
 const ctx=vm.createContext({document:{getElementById:get,createElement:t=>new Element(t),createTextNode:t=>t,querySelectorAll:()=>[],addEventListener:(k,f)=>listeners[k]=f},localStorage:storage,sessionStorage:{getItem:()=>imported&&JSON.stringify(imported),removeItem(){imported=null}},location:{hash:imported?'#import=test':'',pathname:'/escalation-quality.html',search:''},history:{replaceState(){}},window:{addEventListener:(k,f)=>listeners[k]=f},setInterval:(f,ms)=>timers.push({f,ms}),confirm:()=>confirmAnswer,navigator:{clipboard:{async writeText(text){if(failClipboard)throw Error('denied');copied=text}}},URLSearchParams,console,CaseToolkitCore:require('../case-toolkit-core.js'),DevinPrompt:require('../devin-prompt-core.js')});
 if(aiIntegration){ctx.window.DevinConnection={createClient:()=>({})};ctx.window.DevinIntegration={init(api){ctx.ai=api;return {refresh(){}};}};}
 vm.runInContext(fs.readFileSync(require.resolve('../app.js'),'utf8'),ctx);
 return {get,ctx,run:s=>vm.runInContext(s,ctx),async click(id){for(const f of get(id).listeners.click||[])await f()},stored:()=>stored,copied:()=>copied,timers,listeners,setFail:v=>failStorage=v,setConfirm:v=>confirmAnswer=v,writes:()=>writes,externalSave:value=>stored=value};
}
test('valid log select earns full completeness and no-log exception needs a reason',()=>{
 const h=harness();assert.equal(h.run('evaluate(samples.strong).categories.completeness'),35);
 assert.equal(h.run('evaluate({...samples.strong,evidence:"No",logReason:""}).status'),'blocked');
 assert.equal(h.run('evaluate({...samples.strong,evidence:"No",logReason:"Host unavailable during production outage"}).ready_to_escalate'),true);
});
test('10-second autosave restores all fields, checks and paired actions; storage failure remains dirty',()=>{
 const h=harness();h.get('osVersion').value='Build 77';h.run('actions=[{action:"Restarted service",result:"Failure returned"}];renderActions();checks={incident:true};markChanged()');
 assert.equal(h.timers[0].ms,10000);h.timers[0].f();assert.match(h.get('draftStatus').textContent,/Saved/);
 const recovered=harness({stored:h.stored()});assert.equal(recovered.get('osVersion').value,'Build 77');assert.equal(recovered.run('readActions()[0].result'),'Failure returned');assert.equal(recovered.run('checks.incident'),true);
 h.setFail(true);h.get('platform').value='R750';h.run('markChanged();saveDraft()');assert.match(h.get('draftStatus').textContent,/Save failed/);assert.equal(h.run('dirty'),true);
 let prevented=false;h.listeners.beforeunload({preventDefault(){prevented=true}});assert.equal(prevented,true);
 h.setFail(false);h.run('saveDraft()');assert.equal(h.run('dirty'),false);
});
test('edits invalidate review; copy requires a fresh review and reports clipboard failure',async()=>{
 const h=harness();await h.click('loadStrong');assert.equal(h.get('copyButton').disabled,false);await h.click('copyButton');assert.match(h.copied(),/^CASE TITLE:\nPowerEdge R750 \| Windows Server \|/);assert.match(h.copied(),/AFFECTED SYSTEMS \/ USERS:\n1 server, 50 users\n/);assert.doesNotMatch(h.copied(),/SERVICE REQUEST|SERVICE TAG|EXPECTED BEHAVIOR/);
 h.get('problem').value='Changed';h.run('markChanged()');assert.equal(h.get('copyButton').disabled,true);assert.match(h.get('resultTitle').textContent,/review again/);
 await h.click('copyButton');assert.match(h.get('copyStatus').textContent,/Review/);
 const f=harness({failClipboard:true});await f.click('loadStrong');await f.click('copyButton');assert.match(f.get('copyStatus').textContent,/Copy failed/);assert.equal(f.get('copyPreview').selected,true);
});
test('Copy to AI includes current escalation facts and its selected task',async()=>{
 const h=harness();await h.click('loadStrong');h.get('devinTask').value='logs';await h.click('copyDevin');
 assert.match(h.copied(),/Task: Recommend logs to collect/);assert.match(h.copied(),/SEVERITY:\nSev 3/);assert.match(h.get('devinStatus').textContent,/Copied for AI/);
});
test('DE case title is composed from imported platform OS and issue and survives draft restore',()=>{
 const note=core.create(core.empty(),'title',100);
 Object.assign(note,{platform:'PowerEdge R750',os:'Windows Server',issue:'Hyper-V\nVMs are slow'});
 const h=harness({imported:core.escalation(note,100)});
 const expected='PowerEdge R750 | Windows Server | Hyper-V VMs are slow';
 assert.equal(h.get('caseTitle').value,expected);
 assert.equal(harness({stored:h.stored()}).get('caseTitle').value,expected);
 assert.ok(h.run('formatEscalation(data())').startsWith('CASE TITLE:\n'+expected));
 h.get('os').value='Azure Local';h.run('markChanged()');assert.equal(h.get('caseTitle').value,'PowerEdge R750 | Azure Local | Hyper-V VMs are slow');
});
test('case title omits missing parts and clears with the escalation form',()=>{
 const h=harness();h.run('populate({problem:" Boot failure "})');assert.equal(h.get('caseTitle').value,'Boot failure');
 h.run('populate({})');assert.equal(h.get('caseTitle').value,'');assert.equal(h.run('formatEscalation(data())'),'');
});
test('samples and clear protect typed drafts even before first review',async()=>{
 const h=harness();h.get('problem').value='Original work';h.setConfirm(false);await h.click('loadStrong');await h.click('clearForm');assert.equal(h.get('problem').value,'Original work');
});
test('paired rows contribute to review and copy while incomplete pairs block readiness',async()=>{
 const h=harness();await h.click('loadStrong');h.run('actions=[{action:"Restarted the controller",result:""}];renderActions()');assert.equal(h.run('runReview().status'),'blocked');
 h.run('actions=[{action:"Restarted the controller",result:"UI returned for twelve minutes"}];renderActions()');assert.equal(h.run('runReview().ready_to_escalate'),true);assert.match(h.get('copyPreview').value,/UI returned for twelve minutes/);
});
test('Notes handoff imports structured metadata and replaces old paired rows before saving',()=>{
 const note={...core.create(core.empty(),'n',100),request:'SR-555',platform:'R750',supportType:'PSP',logLocation:'Case attachment',toolkit:{impact:'Production degraded',checks:{incident:true},issueType:'network'}};
 const incoming=core.escalation(note,100), h=harness({imported:incoming});
 assert.equal(h.run('fieldIds.includes("serviceRequest")'),false);assert.equal(h.get('platform').value,'R750');assert.equal(h.get('impact').value,'Production degraded');assert.equal(h.run('checks.incident'),true);
 const saved=JSON.parse(h.stored());saved.actions=[{action:'Old',result:'Old'}];
 const replaced=harness({stored:JSON.stringify(saved),imported:incoming});assert.equal(JSON.parse(replaced.stored()).actions.length,0);
});
test('Windows collection categories survive DE import and draft restore',()=>{
 for(const issueType of ['storage','directory','hyperv','cluster','updates','smb']){
  const note=core.create(core.empty(),'category',100);note.toolkit.issueType=issueType;
  const h=harness({imported:core.escalation(note,100)});
  assert.equal(h.run('issueType'),issueType);
  assert.equal(harness({stored:h.stored()}).run('issueType'),issueType);
 }
});

test('another tab cannot silently overwrite a newer draft',()=>{
 const h=harness();h.get('problem').value='Local edits';h.run('markChanged()');
 h.externalSave('newer draft from other tab');assert.equal(h.run('saveDraft()'),false);assert.match(h.get('draftStatus').textContent,/Save paused/);assert.equal(h.stored(),'newer draft from other tab');
});

test('required logs is a required Yes/No select; No asks for the reason, Yes shows Log Location',()=>{
 const html=fs.readFileSync(require.resolve('../escalation-quality.html'),'utf8');
 assert.match(html,/<label class="field">Do you have the Required Logs for this Escalation\? <b>Required<\/b><select id="evidence" required[^>]*><option value="">Select an answer<\/option><option>Yes<\/option><option>No<\/option><\/select><\/label>/);assert.ok(!/type="checkbox"/.test(html),'no Yes/No checkboxes remain');
 const h=harness();assert.equal(h.get('evidence').value,'');assert.equal(h.run('value("evidence")'),'');
 assert.equal(h.get('logReasonField').hidden,true,'an unanswered question asks for neither the reason nor the location');
 assert.equal(h.get('logLocationField').hidden,true);
 const unanswered=h.run('evaluate({...samples.strong,evidence:""})');
 assert.ok(unanswered.blocking_issues.some(item=>item.field==='evidence'),'the answer is required');assert.equal(unanswered.ready_to_escalate,false);
 assert.ok(h.run('evaluate({...samples.strong,evidence:"Maybe"})').blocking_issues.some(item=>item.field==='evidence'),'only Yes or No is accepted');
 h.run('populate({evidence:"No",logReason:"Host unavailable",logLocation:"\\\\old\\share"})');assert.equal(h.get('logReasonField').hidden,false);assert.equal(h.get('logLocationField').hidden,true);
 assert.doesNotMatch(h.run('formatEscalation(reviewData())'),/LOG LOCATION/,'a hidden Log Location is not copied');
 h.run('markChanged();saveDraft()');const restored=harness({stored:h.stored()});assert.equal(restored.get('evidence').value,'No');assert.equal(restored.get('logReasonField').hidden,false);assert.equal(restored.get('logLocationField').hidden,true);
 h.get('evidence').value='Yes';for(const f of h.get('evidence').listeners.change)f();
 assert.equal(h.run('value("evidence")'),'Yes');assert.equal(h.get('logReasonField').hidden,true);assert.equal(h.get('logLocationField').hidden,false);assert.doesNotMatch(h.run('formatEscalation(reviewData())'),/Host unavailable/);
 assert.match(h.run('formatEscalation(reviewData())'),/DO YOU HAVE THE REQUIRED LOGS FOR THIS ESCALATION\?:\nYes\n\nLOG LOCATION:/);
 h.run('populate(samples.strong)');assert.equal(h.get('logLocationField').hidden,false,'the strong sample has logs, so its location shows');
 assert.equal(h.run('evaluate({...samples.strong,evidence:"No",logReason:"Host unavailable during production outage",logLocation:"x"}).warnings.some(w=>w.field==="logLocation")'),false,'a hidden Log Location raises no findings');
 const handoff=harness({imported:{problem:'x',os:'',country:'',troubleshooting:'',sourceNote:'',evidence:''}});assert.equal(handoff.get('evidence').value,'','a Case Notes import without logs leaves the question for the technician');
});
test('customer working time zone is a required select beside Customer Country and is copied',()=>{
 const html=fs.readFileSync(require.resolve('../escalation-quality.html'),'utf8');
 assert.match(html,/<select id="country" required>[\s\S]*?<\/select><\/label>\s*<label class="field">What Timezone Does the Customer Want to Work In\? <b>Required<\/b><select id="timezone" required><option value="">Select time zone<\/option><option>/);
 const h=harness();
 const missing=h.run('evaluate({...samples.strong,timezone:""})');
 assert.ok(missing.blocking_issues.some(item=>item.field==='timezone'&&item.reason==='Required information is missing.'));assert.equal(missing.ready_to_escalate,false);
 h.run('populate(samples.strong)');assert.match(h.run('formatEscalation(reviewData())'),/CUSTOMER COUNTRY:\nUS\n\nWHAT TIMEZONE DOES THE CUSTOMER WANT TO WORK IN\?:\nUS Central/);
 h.run('markChanged();saveDraft()');const old=JSON.parse(h.stored());delete old.fields.timezone;
 const restored=harness({stored:JSON.stringify(old)});assert.equal(restored.get('problem').value,h.get('problem').value,'drafts saved before the question still restore');assert.equal(restored.get('timezone').value,'');
});
test('Issue and impact pairs fields of matching height and paired controls line up',()=>{
 const html=fs.readFileSync(require.resolve('../escalation-quality.html'),'utf8'),css=fs.readFileSync(require.resolve('../styles.css'),'utf8');
 const section=html.match(/<h2>Issue and impact<\/h2>[\s\S]*?<\/section>/)[0];
 const order=[...section.matchAll(/<label class="(field(?: wide)?)">[^<]*<b>Required<\/b><(\w+) id="(\w+)"/g)].map(m=>`${m[3]}:${m[2]}${m[1].includes('wide')?':wide':''}`);
 assert.deepEqual(order,['problem:textarea:wide','severity:select','production:select','affected:input:wide','impact:textarea','timeline:textarea','country:select','timezone:select']);
 assert.match(css,/\.field-grid > \.field \{ align-content:end; \}/,'a wrapped label must not push its control below its neighbour');
 assert.match(css,/\.field input:not\(\[type="checkbox"\]\),\.field select \{ min-height:41px; \}/,'inputs and selects share a height');
});
test('required badges keep their size beside taller fields',()=>{
 const css=fs.readFileSync(require.resolve('../styles.css'),'utf8');
 assert.match(css,/\.field \{ display:grid; align-content:start;/,'grid rows must not stretch to fill a taller cell');
});
test('exact errors and timestamps are required; stating that no error is shown is an answer',()=>{
 const html=fs.readFileSync(require.resolve('../escalation-quality.html'),'utf8');
 assert.match(html,/<label class="field wide">Exact errors and timestamps <b>Required<\/b><textarea id="errors"/);
 const h=harness();
 const missing=h.run('evaluate({...samples.strong,errors:""})');
 assert.ok(missing.blocking_issues.some(item=>item.field==='errors'&&item.reason==='Required information is missing.'));assert.equal(missing.ready_to_escalate,false);
 assert.ok(h.run('evaluate({...samples.strong,errors:"Unknown"})').blocking_issues.some(item=>item.field==='errors'),'a vague answer blocks');
 const noError=h.run('evaluate({...samples.strong,errors:"No error is shown on screen."})');
 assert.ok(!noError.blocking_issues.some(item=>item.field==='errors'));assert.equal(noError.categories.completeness,35);
});
test('Log Location is required when logs were gathered, and only then',()=>{
 const html=fs.readFileSync(require.resolve('../escalation-quality.html'),'utf8');
 assert.match(html,/<label class="field wide" id="logLocationField" hidden>Log Location <b>Required<\/b><input id="logLocation"/);
 const h=harness();
 const missing=h.run('evaluate({...samples.strong,evidence:"Yes",logLocation:""})');
 assert.ok(missing.blocking_issues.some(item=>item.field==='logLocation'&&item.reason==='Required information is missing.'),'Yes without a location blocks');
 assert.equal(missing.ready_to_escalate,false);assert.ok(missing.categories.completeness<35,'and costs completeness');
 assert.ok(h.run('evaluate({...samples.strong,evidence:"Yes",logLocation:"n/a"})').blocking_issues.some(item=>item.field==='logLocation'),'a vague location blocks');
 const no=h.run('evaluate({...samples.strong,evidence:"No",logReason:"Host unavailable during production outage",logLocation:""})');
 assert.ok(!no.blocking_issues.some(item=>item.field==='logLocation'),'No needs no location');assert.equal(no.categories.completeness,35);
 assert.ok(!h.run('evaluate({...samples.strong,evidence:"",logLocation:""})').blocking_issues.some(item=>item.field==='logLocation'),'an unanswered question blocks on itself, not the hidden location');
 assert.equal(h.run('evaluate(samples.strong)').ready_to_escalate,true);
});
test('the tutorial shows the reviewed strong sample and then restores the draft untouched',()=>{
 const h=harness();h.run('populate({problem:"My own draft problem",evidence:"No"});markChanged();saveDraft()');const saved=h.stored();
 h.get('problem').value='Unsaved edit';h.run('markChanged()');
 const previous=h.run('window.EscalationExample.open()');
 assert.equal(h.get('problem').value,h.run('samples.strong.problem'));assert.equal(h.get('reviewState').hidden,false,'the sample is reviewed so the results have content');
 assert.notEqual(h.stored(),saved,'pending edits are saved before the sample loads');const beforeSample=h.stored();
 h.run('markChanged();saveDraft()');assert.equal(h.stored(),beforeSample,'the sample is never saved over the draft');
 h.run('window.EscalationExample.restore')(previous);
 assert.equal(h.get('problem').value,'Unsaved edit');assert.equal(h.get('evidence').value,'No');assert.equal(h.get('reviewState').hidden,true,'an unreviewed draft returns unreviewed');
 assert.equal(h.get('copyButton').disabled,true);assert.equal(h.stored(),beforeSample);
 h.run('runReview()');const reviewed=h.run('window.EscalationExample.open()');h.run('window.EscalationExample.restore')(reviewed);
 assert.equal(h.get('reviewState').hidden,false,'a reviewed draft comes back reviewed');assert.equal(h.get('problem').value,'Unsaved edit');
});
test('unanswered questions alone do not count as work or produce a copy; an answer does',()=>{
 const h=harness();h.run('populate({})');
 assert.equal(h.run('hasWork()'),false);assert.equal(h.run('formatEscalation(reviewData())'),'');
 h.get('evidence').value='No';assert.equal(h.run('hasWork()'),true);
});
test('reproducible is a required Yes/No select; Yes shows required reproduction steps',()=>{
 const html=fs.readFileSync(require.resolve('../escalation-quality.html'),'utf8');
 assert.match(html,/<label class="field">Is this issue reproducible\? <b>Required<\/b><select id="reproducible" required[^>]*><option value="">Select an answer<\/option><option>Yes<\/option><option>No<\/option><\/select><\/label>\s*<label class="field wide" id="reproductionField" hidden>Reproduction steps <b>Required<\/b><textarea id="reproduction"/);
 const h=harness();assert.equal(h.get('reproducible').value,'');assert.equal(h.get('reproductionField').hidden,true);
 const unanswered=h.run('evaluate({...samples.strong,reproducible:""})');
 assert.ok(unanswered.blocking_issues.some(item=>item.field==='reproducible'),'the answer is required');
 assert.equal(unanswered.ready_to_escalate,false);
 assert.ok(h.run('evaluate({...samples.strong,reproducible:"Maybe"})').blocking_issues.some(item=>item.field==='reproducible'),'only Yes or No is accepted');
 h.get('reproducible').value='No';for(const f of h.get('reproducible').listeners.change)f();
 assert.equal(h.get('reproductionField').hidden,true);
 h.get('reproducible').value='Yes';for(const f of h.get('reproducible').listeners.change)f();
 assert.equal(h.get('reproductionField').hidden,false);
 const blocked=h.run('evaluate({...samples.strong,reproducible:"Yes",reproduction:""})');
 assert.ok(blocked.blocking_issues.some(item=>item.field==='reproduction'),'steps are required when reproducible');
 const notReproducible=h.run('evaluate({...samples.strong,reproducible:"No",reproduction:""})');
 assert.ok(!notReproducible.blocking_issues.some(item=>item.field==='reproduction'),'steps are not required otherwise');
 assert.equal(notReproducible.ready_to_escalate,true);
 assert.equal(notReproducible.categories.reproducibility,15,'a detailed timeline earns the reproducibility credit');
 assert.ok(h.run('evaluate({...samples.strong,reproducible:"No",reproduction:"",timeline:"Recently"})').categories.reproducibility<15,'a vague timeline does not');
 // Steps typed before unchecking are kept in the draft but neither scored nor copied.
 h.run('populate({...samples.strong,reproducible:"No"})');assert.equal(h.get('reproductionField').hidden,true);
 const copy=h.run('formatEscalation(reviewData())');assert.match(copy,/IS THIS ISSUE REPRODUCIBLE\?:\nNo/);assert.doesNotMatch(copy,/REPRODUCTION STEPS/);
 h.run('populate(samples.strong)');assert.equal(h.get('reproducible').value,'Yes','the strong sample is reproducible');
 assert.match(h.run('formatEscalation(reviewData())'),/IS THIS ISSUE REPRODUCIBLE\?:\nYes\n\nREPRODUCTION STEPS:/);
});
test('drafts and imports without a reproducible answer keep their steps; without steps the question stays unanswered',()=>{
 const h=harness();h.run('populate(samples.strong);markChanged();saveDraft()');
 const old=JSON.parse(h.stored());delete old.fields.reproducible;
 const restored=harness({stored:JSON.stringify(old)});
 assert.equal(restored.get('reproducible').value,'Yes');assert.equal(restored.get('reproductionField').hidden,false);
 assert.ok(restored.get('reproduction').value.startsWith('1.'));
 const noSteps=JSON.parse(h.stored());delete noSteps.fields.reproducible;noSteps.fields.reproduction='';
 const unanswered=harness({stored:JSON.stringify(noSteps)});assert.equal(unanswered.get('reproducible').value,'');assert.equal(unanswered.get('reproductionField').hidden,true);
 const imported=harness();imported.run('populate({problem:"x",reproduction:""})');assert.equal(imported.get('reproducible').value,'','a Case Notes import must be answered by the technician');
});

test('senior assistance is excluded from scoring and export; total remains 100',()=>{
 const h=harness();assert.equal(h.run('evaluate(samples.strong).score'),100);
 assert.equal(h.run('required.includes("request")'),false);
 assert.equal(h.run('Object.hasOwn(evaluate(samples.strong).categories,"clear_request")'),false);
 assert.doesNotMatch(h.run('formatEscalation({...samples.strong,request:"Old assistance text"})'),/Old assistance text|REQUESTED SENIOR/);
});

test('every Case Notes field reaches its corresponding escalation input and survives reload',()=>{
 const note=core.create(core.empty(),'mapped',100);
 Object.assign(note,{tag:'TAG1234',platform:'PowerEdge R750',request:'000456',os:'Ubuntu',country:'GB',supportType:'Solution Support includes OS',logLocation:'https://example.com/logs',issue:'Application timeout',notes:'<p>Restarted service</p><p>Timeout persisted</p>',next:'<p>Collect service diagnostics</p>'});
 note.toolkit.impact='Two users affected';
 const h=harness({imported:core.escalation(note,200)});
 const expected={platform:note.platform,os:note.os,country:note.country,supportType:note.supportType,logLocation:note.logLocation,problem:note.issue,troubleshooting:core.plainText(note.notes),impact:note.toolkit.impact};
 const restored=harness({stored:h.stored()});
 for(const [id,value] of Object.entries(expected)){assert.equal(h.get(id).value,value,id);assert.equal(restored.get(id).value,value,id+' restored');}
 // Log Location is set, so the handoff answers the gathered-logs question; results stay empty for outcomes to be recorded.
 assert.equal(h.get('evidence').value,'Yes');assert.equal(h.get('results').value,'');
 assert.ok(h.get('sourceNote').value.includes(core.plainText(note.next)));
 assert.equal(h.run('fieldIds.includes("nextSteps")'),false);
});


test('Service Tag is optional and does not reduce completeness or block readiness',()=>{
 const h=harness();const result=h.run('evaluate({...samples.strong,tag:""})');
 assert.equal(result.ready_to_escalate,true);assert.equal(result.categories.completeness,35);
 assert.ok(!result.blocking_issues.some(item=>item.field==='tag'));
});

test('OS Support is required and every available selection receives full completeness credit',()=>{
 const h=harness();const missing=h.run('evaluate({...samples.strong,supportType:""})');
 assert.equal(missing.ready_to_escalate,false);assert.ok(missing.blocking_issues.some(item=>item.field==='supportType'));
 assert.ok(missing.categories.completeness<35);
 for(const supportType of ['OEM OS','ProSupport Plus Bring Your own License','Solution Support includes OS','No Software Support','OEM','PSP','No OS Support']){
  const result=h.run('evaluate({...samples.strong,supportType:'+JSON.stringify(supportType)+'})');
  assert.equal(result.categories.completeness,35);assert.equal(result.ready_to_escalate,true);
 }
});

test('Action Plan / Next Steps has no standalone escalation field or copy section',()=>{
 const h=harness();assert.equal(h.run('fieldIds.includes("nextSteps")'),false);
 assert.doesNotMatch(h.run('formatEscalation({...samples.strong,nextSteps:"Pending action"})'),/Pending action|ACTION PLAN/);
});

test('OS version/build is required; concise versions receive completeness credit',()=>{
 const h=harness();const missing=h.run('evaluate({...samples.strong,osVersion:""})');
 assert.equal(missing.ready_to_escalate,false);assert.ok(missing.blocking_issues.some(item=>item.field==='osVersion'));
 assert.ok(missing.categories.completeness<35);
 const filled=h.run('evaluate({...samples.strong,osVersion:"8.0 U3"})');
 assert.equal(filled.ready_to_escalate,true);assert.equal(filled.categories.completeness,35);
});
test('scoring requirements exactly match current visible Required labels',()=>{
 const h=harness(),html=fs.readFileSync(require.resolve('../escalation-quality.html'),'utf8');
 const marked=[...html.matchAll(/<label\b[^>]*>(?:(?!<\/label>)[\s\S])*?<b>Required<\/b><(?:input|select|textarea) id="([^"]+)"/g)].map(m=>m[1]).sort();
 // The log reason is required whenever logs were not gathered; every other badge is an always-required field.
 assert.deepEqual([...Array.from(h.run('required')),'logReason'].sort(),marked);
 for(const field of h.run('required')){
  const result=h.run('evaluate({...samples.strong,['+JSON.stringify(field)+']:""})');
  assert.equal(result.ready_to_escalate,false,field);assert.ok(result.blocking_issues.some(i=>i.field===field),field);
 }
});
test('readiness boundary is 75 and blockers override any score',()=>{
 const h=harness();assert.equal(h.run('readiness(74,[]).ready_to_escalate'),false);assert.equal(h.run('readiness(75,[]).ready_to_escalate'),true);assert.equal(h.run('readiness(100,[{}]).status'),'blocked');
 assert.equal(h.run('Object.values(scoreMaxima).reduce((a,b)=>a+b,0)'),100);
});
test('empty and older partial inputs are safe; placeholders and invalid support choices block',()=>{
 const h=harness();assert.equal(h.run('evaluate({}).score'),0);assert.equal(h.run('evaluate({}).status'),'blocked');
 for(const value of ['','   ','Unknown','[Add version]'])assert.equal(h.run('evaluate({...samples.strong,osVersion:'+JSON.stringify(value)+'}).ready_to_escalate'),false);
 assert.equal(h.run('evaluate({...samples.strong,supportType:"Other"}).ready_to_escalate'),false);
 assert.equal(h.run('evaluate({...samples.strong,evidence:"No",logReason:"Unknown"}).ready_to_escalate'),false);
});
test('optional, removed fields and helper plans do not inflate or penalize readiness',()=>{
 const h=harness();const base=h.run('evaluate(samples.strong)');
 assert.equal(h.run('evaluate({...samples.strong,tag:"",request:"",workaround:"",deadline:"",nextSteps:""}).score'),base.score);
 assert.equal(h.run('evaluate({...samples.strong,collectionPlan:"Collect every log",checks:{incident:true}}).categories.evidence'),base.categories.evidence);
 assert.equal(h.run('evaluate({...samples.strong,logLocation:""}).categories.evidence'),base.categories.evidence-2);
 assert.equal(h.run('evaluate({...samples.strong,expected:"Dashboard loads",serviceRequest:"123456789"}).score'),base.score);
});
test('incomplete action pairs receive no fabricated outcome credit or overall ready praise',async()=>{
 const h=harness();await h.click('loadStrong');h.get('results').value='';h.run('actions=[{action:"Restarted controller",result:""}];renderActions()');
 const result=h.run('runReview()');assert.equal(result.ready_to_escalate,false);assert.ok(!result.strengths.some(item=>item.field==='overall'));
 assert.equal(h.run('reviewData().results'),'');assert.doesNotMatch(h.get('copyPreview').value,/\[Result missing\]/);
});

// --- Content scoring: fixtures from the scoring review (items 9-15) ---
const lorem='Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident 1.';
const requiredText=['problem','impact','timeline','errors','changes','reproduction','troubleshooting','results','osVersion'];
const baseForm={timezone:'US Eastern (ET, UTC−5/−4)',evidence:'Yes',logLocation:'Case attachments',reproducible:'Yes',supportType:'OEM OS',country:'US',os:'Windows Server',severity:'Sev 2',production:'Service unavailable',affected:'1 host'};
const honest={...baseForm,problem:'Hyper-V host crashes.',impact:'Production down for all users.',timeline:'Started 2026-10-01, happens daily',changes:'None',reproduction:'1. Start VMs\n2. Wait',troubleshooting:'1. Rebooted\n2. Checked logs',results:'No change observed.',errors:'No error is shown on screen.',osVersion:'Windows Server 2022'};
function run(h,form){h.ctx.fixture=form;return h.run('evaluate(fixture)');}
test('lorem ipsum in every required field is flagged as placeholder text and is not Ready',()=>{
 const h=harness();const form={...baseForm,severity:'',production:'',affected:''};for(const id of requiredText)form[id]=lorem;
 const result=run(h,form);
 assert.equal(result.ready_to_escalate,false);assert.ok(result.score<75,String(result.score));
 assert.ok(result.warnings.some(w=>/repeated or placeholder/.test(w.reason)));
 assert.ok(result.categories.completeness<35);assert.ok(result.categories.specificity<10);
 assert.ok(!result.strengths.some(s=>s.field==='overall'));
});
test('repeated gibberish with step prefixes, one keyword and one digit per field is not Ready and earns no praise',()=>{
 const h=harness();const g=k=>`1. blah blah blah blah ${k} 7\n2. blah blah blah blah blah`;
 const form={...baseForm,problem:g('error'),impact:g('users'),timeline:g('since'),changes:g('always'),reproduction:g('every'),troubleshooting:g('failed'),results:g('observed'),osVersion:g('build'),errors:g('timestamp')};
 const result=run(h,form);
 assert.equal(result.ready_to_escalate,false);assert.ok(result.score<75,String(result.score));
 for(const field of ['overall','reproduction','troubleshooting'])assert.ok(!result.strengths.some(s=>s.field===field),field);
 assert.ok(result.warnings.filter(w=>/repeated or placeholder/.test(w.reason)).length>=8);
});
test('weak phrases block short fields as a prefix or whole word but not long fields that contain the word',()=>{
 const h=harness();const strong=h.run('samples.strong');
 assert.equal(run(h,{...strong,results:'see above please'}).status,'blocked');
 assert.equal(run(h,{...strong,osVersion:'latest'}).status,'blocked');
 for(const phrase of ['see above','as above','latest','newest','current','tbd','tba','asap','ok','okay','fine','n/a','none','unknown','not sure','ask customer','pending','wip']){
  const result=run(h,{...strong,osVersion:phrase});
  assert.equal(result.ready_to_escalate,false,phrase);assert.ok(result.blocking_issues.some(i=>i.field==='osVersion'),phrase);
 }
 assert.match(strong.results,/\bsame\b/);assert.equal(run(h,strong).ready_to_escalate,true);
 assert.equal(run(h,{...strong,evidence:'No',logReason:'Fine, the customer declined log collection for compliance reasons'}).ready_to_escalate,true);
});
test('results copied from troubleshooting block readiness and earn no results credit',()=>{
 const h=harness();const strong=h.run('samples.strong');const base=run(h,strong);
 const result=run(h,{...strong,results:strong.troubleshooting});
 assert.equal(result.status,'blocked');assert.ok(result.blocking_issues.some(i=>i.field==='results'&&/repeats/i.test(i.reason)));
 assert.ok(result.categories.troubleshooting<=base.categories.troubleshooting-7);
 assert.ok(!result.strengths.some(s=>s.field==='troubleshooting'||s.field==='overall'));
});
test('cross-field duplicates warn, name both fields and credit only the first copy',()=>{
 const h=harness();const strong=h.run('samples.strong');const base=run(h,strong);
 const result=run(h,{...strong,impact:strong.problem});
 assert.ok(result.warnings.some(w=>w.field==='impact'&&/repeats problem statement/i.test(w.reason)));
 assert.ok(result.categories.completeness<base.categories.completeness);assert.ok(result.score<base.score);
 assert.ok(!result.warnings.some(w=>w.field==='problem'));
});
test('severity, service impact and affected systems are required and earn specificity points',()=>{
 const h=harness();const strong=h.run('samples.strong');const base=run(h,strong);
 assert.equal(base.score,100);
 const none=run(h,{...strong,severity:'',production:'',affected:''});
 assert.equal(base.categories.specificity-none.categories.specificity,7);
 for(const [field,points] of [['severity',2],['production',2],['affected',3]]){
  const missing=run(h,{...strong,[field]:''});
  assert.equal(base.categories.specificity-missing.categories.specificity,points,field);
  assert.equal(missing.status,'blocked',field);assert.ok(missing.blocking_issues.some(i=>i.field===field),field+' is required');
 }
 assert.ok(run(h,{...strong,affected:'ok'}).blocking_issues.some(i=>i.field==='affected'),'a vague answer is blocked');
 const impact='Month-end close cannot be completed while the share is unreachable, and the finance close is late.';
 assert.ok(run(h,{...strong,impact,affected:''}).warnings.some(w=>w.field==='impact'));
 assert.ok(!run(h,{...strong,impact,affected:'40 users'}).warnings.some(w=>w.field==='impact'));
});
test('Recent changes is required; a plain None is accepted but Unknown is not',()=>{
 const h=harness();const strong=h.run('samples.strong');
 const missing=run(h,{...strong,changes:''});assert.equal(missing.status,'blocked');assert.ok(missing.blocking_issues.some(i=>i.field==='changes'));
 for(const answer of ['None','none.','No changes','No known changes','Nothing changed'])assert.equal(run(h,{...strong,changes:answer}).ready_to_escalate,true,answer);
 for(const answer of ['Unknown','n/a','tbd'])assert.ok(run(h,{...strong,changes:answer}).blocking_issues.some(i=>i.field==='changes'),answer);
});
test('Service Tag, Service Request Number and Expected behavior are removed from the form and the copy',()=>{
 const html=fs.readFileSync(require.resolve('../escalation-quality.html'),'utf8');
 for(const id of ['tag','serviceRequest','expected'])assert.ok(!html.includes(`id="${id}"`),id);
 for(const label of ['Severity','Service Impact','Affected Systems / Users','Recent changes'])assert.ok(html.includes(`>${label} <b>Required</b>`),label);
 const h=harness();for(const id of ['tag','serviceRequest','expected'])assert.equal(h.run(`fieldIds.includes("${id}")`),false,id);
 // An older saved draft that still has the removed fields restores without them.
 h.run('populate(samples.strong);markChanged();saveDraft()');const old=JSON.parse(h.stored());Object.assign(old.fields,{tag:'ABC1234',serviceRequest:'123',expected:'Loads'});
 const restored=harness({stored:JSON.stringify(old)});
 assert.equal(restored.get('problem').value,h.run('samples.strong').problem);
 assert.doesNotMatch(restored.run('formatEscalation(reviewData())'),/ABC1234|EXPECTED/);
});
test('a short honest entry in real words scores no lower than lorem ipsum',()=>{
 const h=harness();const form={...baseForm};for(const id of requiredText)form[id]=lorem;
 const real=run(h,honest), fake=run(h,form);
 assert.ok(real.score>=fake.score,`${real.score} vs ${fake.score}`);assert.equal(real.blocking_issues.length,0);
 assert.equal(real.categories.completeness,35);assert.ok(real.categories.troubleshooting>fake.categories.troubleshooting);
});
test('outcome credit is proportional to the troubleshooting actions covered',()=>{
 const h=harness();const strong=h.run('samples.strong');const base=run(h,strong);
 const partial=run(h,{...strong,results:'1. Both browsers returned the same 503 error page after login and the dashboard never rendered at all.'});
 assert.ok(partial.categories.troubleshooting<base.categories.troubleshooting);
 assert.ok(partial.warnings.some(w=>w.field==='results'&&/1 of 5 actions/.test(w.reason)));
 assert.ok(!partial.strengths.some(s=>s.field==='troubleshooting'));
});
test('built-in samples keep their verdicts',()=>{
 const h=harness();const weak=run(h,h.run('samples.weak')),strong=run(h,h.run('samples.strong'));
 assert.equal(weak.status,'blocked');assert.equal(strong.score,100);assert.equal(strong.status,'ready');
 assert.equal(strong.strengths.map(s=>s.field).sort().join(),'evidence,overall,reproduction,troubleshooting');
 assert.equal(h.run('Object.values(scoreMaxima).reduce((a,b)=>a+b,0)'),100);
});
test('escalation text plausibility stays identical to the shared Case Notes helper',()=>{
 const h=harness(),R=require('../case-rubric-core.js');
 const strong=h.run('samples.strong');
 const samplesText=['','x','blah blah blah blah blah blah blah blah','No change.\nNo change.\nNo change.',lorem,honest.troubleshooting,strong.results,strong.troubleshooting,fs.readFileSync(require.resolve('../CASE_NOTES_GUIDE.md'),'utf8')];
 for(const text of samplesText){h.ctx.fixture=text;assert.equal(h.run('textQuality.filler(fixture)'),R.text.filler(text),text.slice(0,40));}
 for(const [a,b] of [[strong.results,strong.troubleshooting],[strong.problem,strong.problem],[honest.problem,honest.impact]]){h.ctx.a=a;h.ctx.b=b;assert.equal(h.run('textQuality.similarity(a,b)'),R.text.similarity(a,b));}
});
test('Case Notes handoff fills recent changes, service impact and gathered logs, and leaves results empty with the import hint',()=>{
 const note=core.create(core.empty(),'handoff-map',100);
 Object.assign(note,{issue:'Cluster node evictions',logLocation:'https://example.com/logs',notes:'<p>Collected cluster log</p>'});
 note.toolkit.workflow={...require('../case-workflow-core.js').defaults(),recentChange:'Patched node 2 on 2026-09-30',severity:'Service unavailable'};
 const h=harness({imported:core.escalation(note,200)});
 assert.equal(h.get('changes').value,'Patched node 2 on 2026-09-30');assert.equal(h.get('production').value,'Service unavailable');
 assert.equal(h.get('evidence').value,'Yes');assert.equal(h.get('results').value,'');
 const html=fs.readFileSync(require.resolve('../escalation-quality.html'),'utf8');
 // Both pages label the field Service Impact and offer exactly the same options, so the handoff needs no mapping.
 const notesHtml=fs.readFileSync(require.resolve('../case-notes.html'),'utf8');
 const options=markup=>[...markup.matchAll(/<option([^>]*)>([^<]*)<\/option>/g)].filter(m=>!/value=""/.test(m[1])).map(m=>m[2]);
 const triage=options(notesHtml.match(/<select data-workflow-field="severity">[\s\S]*?<\/select>/)[0]).filter(o=>o!=='Unspecified');
 const escalation=options(html.match(/<select id="production"[^>]*>[\s\S]*?<\/select>/)[0]);
 assert.deepEqual(escalation,triage);assert.deepEqual(triage,['Service unavailable','Service degraded','Deployment','How-to / planning']);
 assert.match(html,/<label class="field">Service Impact <b>Required<\/b><select id="production" required>/);assert.match(notesHtml,/<label class="field">Service Impact<select data-workflow-field="severity">/);
 for(const severity of triage){note.toolkit.workflow.severity=severity;assert.equal(core.escalation(note,200).production,severity);}
 note.toolkit.workflow.severity='Unspecified';assert.equal(core.escalation(note,200).production,'');
 assert.match(html,/left empty on import: document outcomes there/);
 assert.match(html,/repeated or placeholder text/);assert.match(html,/Severity \(2\), Service Impact \(2\) and Affected Systems \/ Users \(3\)/);
});
test('saved drafts and reviews still carrying the former Production status values map onto the shared options',()=>{
 const h=harness();const strong=h.run('samples.strong');
 const populate=production=>{h.ctx.fixture={...strong,production};h.run('populate(fixture)');return h.get('production').value;};
 assert.equal(populate('Production down'),'Service unavailable');
 assert.equal(populate('Production degraded'),'Service degraded');
 assert.equal(populate('Non-production'),'Non-production','values without a Triage equivalent are kept rather than dropped');
 assert.equal(run(h,{...strong,production:'Production degraded'}).score,run(h,strong).score);
 assert.equal(h.run('labels.production'),'Service Impact');
});
