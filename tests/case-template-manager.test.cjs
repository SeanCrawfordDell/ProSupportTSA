const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../js/case-toolkit-core.js');
function setup(){
 const elements={},values=new Map();let fail=false;
 const get=id=>elements[id]??={value:'',textContent:'',hidden:false,handlers:{},addEventListener(k,f){this.handlers[k]=f;},replaceChildren(...items){this.children=items;},showModal(){this.open=true;},close(){this.open=false;},focus(){}};
 get('caseIssueType').value='boot';
 const storage={getItem:k=>values.get(k)??null,setItem(k,v){if(fail)throw Error('Storage full');values.set(k,v);}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../js/case-template-manager.js'),'utf8'),{CaseToolkitCore:core,document:{getElementById:get,createElement:()=>({})},window:{CaseToolkit:{canEdit:()=>true},dispatchEvent(){}},localStorage:storage,crypto:{randomUUID:()=> 'test'},confirm:()=>true,Event:class{}});
 return {get,storage,fail(){fail=true;},click:id=>get(id).handlers.click(),save:()=>get('templateEditorForm').handlers.submit({preventDefault(){}}),saved:()=>core.loadTemplates(storage)};
}
test('manager renames built-ins, resets defaults, and creates and deletes personal templates',()=>{
 const h=setup();h.click('manageTemplates');assert.equal(h.get('templateName').value,core.templates.boot.name);
 h.get('templateName').value='Boot custom';h.save();assert.equal(h.saved().boot.name,'Boot custom');
 h.click('resetTemplate');assert.equal(h.saved().boot,undefined);assert.equal(h.get('templateName').value,core.templates.boot.name);
 h.click('newTemplate');h.get('templateName').value='My checks';h.get('templateNotes').value='Check controller';h.get('templateNext').value='Collect logs';h.save();
 assert.equal(h.saved()['custom-test'].notes,'Check controller');assert.equal(h.get('deleteTemplate').hidden,false);
 h.click('deleteTemplate');assert.equal(h.saved()['custom-test'],undefined);
});
test('failed manager saves retain the draft and original persisted settings',()=>{
 const h=setup();h.click('manageTemplates');h.get('templateName').value='My boot';h.fail();h.save();
 assert.deepEqual(h.saved(),{});assert.equal(h.get('templateName').value,'My boot');assert.match(h.get('templateManagerStatus').textContent,/Storage full/);
});
test('manager detects settings changes made elsewhere before overwriting them',()=>{
 const h=setup();h.click('manageTemplates');h.get('templateName').value='Local edit';
 core.saveTemplates(h.storage,{boot:{name:'Other tab',notes:'Checks',next:''}});h.save();
 assert.equal(h.saved().boot.name,'Other tab');assert.match(h.get('templateManagerStatus').textContent,/changed elsewhere/);
});
