const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function load({stored=null,reduced=false}={}){
 const store=new Map(stored===null?[]:[['dell-support.copy-rumble',stored]]),nodes={},buzz=[],tones=[],gains=[];
 const node=()=>{const classes=new Set();return {classes,offsetWidth:0,classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}};};
 const param={setValueAtTime(){},exponentialRampToValueAtTime(v){assert.ok(v>0&&Number.isFinite(v));},value:0};
 class AudioContext{constructor(){this.currentTime=0;this.destination={};}createGain(){const g={gain:{...param},connect(to){g.to=to;}};gains.push(g);return g;}createBiquadFilter(){return {frequency:param,Q:param,connect(){}};}get sampleRate(){return 8000;}createBuffer(c,n){const d=new Float32Array(n);return {getChannelData:()=>d};}get sampleRate(){return 8000;}createBuffer(c,n){const d=new Float32Array(n);return {getChannelData:()=>d};}createBufferSource(){const o={connect(){},start(){tones.push(o);},stop(){}};return o;}}
 const timers=[];
 const window={matchMedia:()=>({matches:reduced}),AudioContext};
 vm.runInNewContext(fs.readFileSync(require.resolve('../js/copy-rumble.js'),'utf8'),{window,localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},
  document:{getElementById:id=>['siteTopbar','main'].includes(id)?(nodes[id]??=node()):null},navigator:{vibrate:p=>buzz.push(p)},setTimeout:f=>timers.push(f),clearTimeout(){}});
 return {R:window.CopyRumble,store,nodes,buzz,tones,timers,gains};
}
test('shake and sound are on by default, shake the top bar and main content, then settle',()=>{
 const h=load();assert.equal(h.R.enabled(),true);assert.equal(h.R.play(),true);
 assert.ok(h.nodes.main.classes.has('copy-rumble'));assert.ok(h.nodes.siteTopbar.classes.has('copy-rumble'));
 assert.equal(h.tones.length,4,'shutter open and close, each with a snap and a body');assert.equal(h.buzz.length,1);
 const master=h.gains.find(g=>g.to&&!h.gains.includes(g.to));assert.ok(master.gain.value<=0.1,'the shutter click plays very quietly');
 assert.ok(h.gains.filter(g=>g!==master).every(g=>g.to===master),'every layer goes through the quiet master volume');
 h.timers.forEach(f=>f());assert.equal(h.nodes.main.classes.has('copy-rumble'),false);
});
test('turning the effect off stops shake, sound and vibration',()=>{
 const h=load();h.R.setEnabled(false);assert.equal(h.store.get('dell-support.copy-rumble'),'false');
 assert.equal(h.R.play(),false);assert.equal(h.nodes.main,undefined);assert.equal(h.tones.length,0);assert.equal(h.buzz.length,0);
 assert.equal(load({stored:'false'}).R.enabled(),false);
});
test('reduced motion keeps the sound but skips the shake',()=>{
 const h=load({reduced:true});h.R.play();assert.equal(h.nodes.main,undefined);assert.equal(h.tones.length,4);
});
test('Copy to Lightning plays the effect and Customize Site Options has the toggle',()=>{
 const html=fs.readFileSync(require.resolve('../case-notes.html'),'utf8'),notes=fs.readFileSync(require.resolve('../js/case-notes.js'),'utf8');
 assert.match(html,/<h2 id="customizerTitle">Customize Site Options<\/h2>/);
 assert.match(html,/<input type="checkbox" id="copyRumbleToggle" checked><span>Shake the screen and play a sound/);
 assert.match(html,/<script src="js\/copy-rumble\.js\?v=[^"]+" defer><\/script>/);
 assert.match(/\$\("copyNote"\)\.addEventListener[\s\S]*?finally/.exec(notes)[0],/writeText[\s\S]*CopyRumble\?\.play\(\)/,'plays only after a successful copy');
});
test('the shake setting is backed up and validated with other settings',()=>{
 const S=require('../js/case-settings-core.js'),C=require('../js/case-notes-core.js');
 const captured=S.capture({getItem:k=>k==='dell-support.copy-rumble'?'false':null});assert.equal(captured.copyRumble,'false');
 assert.equal(S.validate({fieldConfig:C.empty().fieldConfig,preferences:captured},C.fields).values['dell-support.copy-rumble'],'false');
 assert.throws(()=>S.validate({fieldConfig:C.empty().fieldConfig,preferences:{copyRumble:'loud'}},C.fields));
});
