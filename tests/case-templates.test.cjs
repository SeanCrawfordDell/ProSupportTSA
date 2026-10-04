const test=require('node:test'),assert=require('node:assert/strict');
const T=require('../js/case-toolkit-core.js'),C=require('../js/case-notes-core.js'),S=require('../js/case-settings-core.js');
const custom={name:'Storage checks',notes:'Check controller\n<img src=x onerror=alert(1)>',next:'Collect logs'};
test('personal templates override built-in names and content without changing defaults',()=>{
 const original=T.templates.boot.name;
 const overrides=T.validateTemplates({boot:custom,'custom-test':custom});
 assert.equal(T.templateCatalog(overrides).boot.name,'Storage checks');
 assert.equal(T.templates.boot.name,original);
 assert.ok(T.templateHtml('boot',overrides).includes('&lt;img'));
 assert.ok(!T.templateHtml('boot',overrides).includes('<img'));
 assert.match(T.templateNextHtml('custom-test',overrides),/Collect logs/);
 assert.equal(T.templateCatalog({}).boot.name,original);
});
test('template validation rejects malformed and unsafe records',()=>{
 for(const bad of [[],{bad:custom},{'custom-test':{...custom,name:''}},{boot:{...custom,notes:5}},JSON.parse('{"__proto__":{}}')])assert.throws(()=>T.validateTemplates(bad));
});
test('custom-template case IDs survive history backup even without template settings',()=>{
 const state=C.empty(),note=C.create(state,'a',1000);note.toolkit.issueType='custom-deleted';note.notes='Keep my notes';
 const restored=C.parse(C.backup(state,2000));assert.equal(restored.cases[0].toolkit.issueType,'custom-deleted');
 assert.equal(restored.cases[0].notes,'Keep my notes');assert.ok(T.checklist(note).every(item=>typeof item.text==='string'));
 assert.throws(()=>T.templateHtml('custom-deleted',{}),/unavailable/i);
});
test('settings include personal templates and reject malformed template backups',()=>{
 const values=new Map([['dell-support.case-templates.v1',JSON.stringify({boot:custom})]]);
 const captured=S.capture({getItem:key=>values.get(key)??null});assert.deepEqual(captured.templates,{boot:custom});
 const settings=S.validate({fieldConfig:C.empty().fieldConfig,preferences:captured},C.fields);
 assert.deepEqual(JSON.parse(settings.values['dell-support.case-templates.v1']),{boot:custom});
 captured.templates={boot:{name:'Bad'}};assert.throws(()=>S.validate({fieldConfig:C.empty().fieldConfig,preferences:captured},C.fields));
 assert.doesNotThrow(()=>S.validate({fieldConfig:C.empty().fieldConfig},C.fields));
});
