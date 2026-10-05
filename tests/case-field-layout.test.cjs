const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const C=require('../js/case-notes-core.js');

test('mergeFieldOrder moves only the Case Details fields and keeps every other slot',()=>{
 const order=['tag','platform','request','os','osVersion','notes','next'];
 assert.deepEqual(C.mergeFieldOrder(order,['osVersion','tag','request','platform']),['osVersion','tag','request','os','platform','notes','next']);
 const state=C.empty();C.reorderFields(state,C.mergeFieldOrder(state.fieldConfig.order,['issue','tag']));
 assert.equal(state.fieldConfig.order[0],'issue');assert.equal(state.fieldConfig.order.length,C.defaultFieldOrder.length);
 assert.throws(()=>C.mergeFieldOrder(order,['tag','tag']),/Invalid/);
 assert.throws(()=>C.mergeFieldOrder(order,['missing']),/Invalid/);
});

// Minimal DOM: enough for the grid, its field labels, the grip spans and the heading controls.
function node(tag,props={}){
 const n={tag,children:[],parentElement:null,listeners:{},attributes:{},hidden:false,disabled:false,textContent:'',inert:false,classes:new Set(),...props,
  classList:{add:c=>n.classes.add(c),remove:c=>n.classes.delete(c),toggle:(c,on)=>on?n.classes.add(c):n.classes.delete(c),contains:c=>n.classes.has(c)},
  setAttribute(k,v){n.attributes[k]=v;},addEventListener(k,f){n.listeners[k]=f;},focus(){focused=n;},
  insertBefore(child,ref){child.parentElement?.children.splice(child.parentElement.children.indexOf(child),1);const i=ref?n.children.indexOf(ref):-1;n.children.splice(i<0?n.children.length:i,0,child);child.parentElement=n;},
  prepend(child){n.children.unshift(child);child.parentElement=n;},
  remove(){n.parentElement?.children.splice(n.parentElement.children.indexOf(n),1);n.parentElement=null;},
  get nextSibling(){const p=n.parentElement;return p?p.children[p.children.indexOf(n)+1]??null:null;},
  querySelector(sel){return sel===':scope > .field-grip'?n.children.find(c=>c.classes.has('field-grip'))??null:null;},
  querySelectorAll(){return n.children.filter(c=>['input','select','textarea'].includes(c.tag));},
  closest(sel){let c=n;while(c&&!(sel==='.field-grip'?c.classes.has('field-grip'):c.classes.has('field')))c=c.parentElement;return c??null;}};
 Object.defineProperty(n,'className',{set(v){n.classes=new Set(v.split(' '));}});
 return n;
}
let focused=null;
function setup({canEdit=true,save=()=>true}={}){
 const labels={tag:'Service Tag',platform:'System/Platform',issue:'Issue Description'};
 const grid=node('div'),toggle=node('button'),cancel=node('button'),status=node('p');
 for(const id of Object.keys(labels)){const label=node('label');label.classes.add('field');label.insertBefore(node('input',{id}),null);grid.insertBefore(label,null);}
 const other=node('div');grid.insertBefore(other,null);
 const ctx={window:{},document:{createElement:tag=>node(tag)}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../js/case-field-layout.js'),'utf8'),ctx);
 const L=ctx.window.CaseFieldLayout,saved=[];let allowed=canEdit;
 L.init({grid,toggle,cancel,status,canEdit:()=>allowed,fieldId:c=>c.children.find(x=>x.tag==='input')?.id??null,label:id=>labels[id],save:order=>{saved.push(order);return save(order);}});
 const order=()=>grid.children.filter(c=>c!==other).map(c=>c.children.find(x=>x.tag==='input').id);
 const key=k=>grid.listeners.keydown({key:k,target:focused,preventDefault(){}});
 return {L,grid,toggle,cancel,status,other,saved,order,key,deny(){allowed=false;L.refresh();}};
}

test('unlock adds a grip per field, makes inputs inert and focuses the first grip',()=>{
 const h=setup();h.toggle.listeners.click();
 assert.ok(h.grid.classes.has('layout-editing'));assert.equal(h.toggle.textContent,'Done');assert.equal(h.cancel.hidden,false);
 assert.equal(h.grid.children.filter(c=>c.querySelector(':scope > .field-grip')).length,3);
 assert.ok(h.grid.children[0].children.find(c=>c.tag==='input').inert);assert.equal(focused,h.grid.children[0].children[0]);
});
test('arrow keys move the focused field and announce its position',()=>{
 const h=setup();h.toggle.listeners.click();h.key('ArrowDown');
 assert.deepEqual(h.order(),['platform','tag','issue']);assert.match(h.status.textContent,/Service Tag moved to position 2 of 3/);
 h.key('ArrowRight');h.key('ArrowRight');assert.deepEqual(h.order(),['platform','issue','tag']);assert.match(h.status.textContent,/already last/);
 assert.equal(h.grid.children.at(-1),h.other);
});
test('Done saves the new grid order once and locks the layout',()=>{
 const h=setup();h.toggle.listeners.click();h.key('ArrowDown');h.toggle.listeners.click();
 assert.deepEqual(h.saved.map(o=>[...o]),[['platform','tag','issue']]);assert.equal(h.toggle.textContent,'Unlock layout');assert.equal(h.cancel.hidden,true);
 assert.equal(h.grid.children[0].children.some(c=>c.classes.has('field-grip')),false);assert.equal(h.grid.children[0].children.find(c=>c.tag==='input').inert,false);
});
test('Done without changes does not save',()=>{
 const h=setup();h.toggle.listeners.click();h.toggle.listeners.click();assert.equal(h.saved.length,0);assert.match(h.status.textContent,/unchanged/);
});
test('a failed save restores the previous order',()=>{
 const h=setup({save:()=>false});h.toggle.listeners.click();h.key('ArrowDown');h.toggle.listeners.click();
 assert.deepEqual(h.order(),['tag','platform','issue']);assert.match(h.status.textContent,/Could not save/);
});
test('Cancel and Escape restore the order without saving',()=>{
 const h=setup();h.toggle.listeners.click();h.key('ArrowDown');h.cancel.listeners.click();
 assert.deepEqual(h.order(),['tag','platform','issue']);assert.equal(h.saved.length,0);assert.equal(focused,h.toggle);
 h.toggle.listeners.click();h.key('ArrowDown');h.key('Escape');assert.deepEqual(h.order(),['tag','platform','issue']);assert.equal(h.L.editing(),false);
});
test('losing edit rights locks the layout and discards changes',()=>{
 const h=setup();h.toggle.listeners.click();h.key('ArrowDown');h.deny();
 assert.deepEqual(h.order(),['tag','platform','issue']);assert.equal(h.toggle.disabled,true);assert.equal(h.L.editing(),false);
 h.toggle.listeners.click();assert.equal(h.L.editing(),false);
});
test('read-only pages cannot unlock',()=>{
 const h=setup({canEdit:false});assert.equal(h.toggle.disabled,true);h.toggle.listeners.click();assert.equal(h.L.editing(),false);
});
test('case-notes.html loads the layout script with the shared version tag and offers the toggle',()=>{
 const html=fs.readFileSync(require.resolve('../case-notes.html'),'utf8');
 assert.match(html,/<script src="js\/case-field-layout\.js\?v=[^"]+" defer><\/script>\s*<script src="js\/case-notes\.js/);
 assert.match(html,/id="layoutToggle"[^>]*aria-pressed="false"/);assert.match(html,/id="layoutCancel"[^>]*hidden/);
});
