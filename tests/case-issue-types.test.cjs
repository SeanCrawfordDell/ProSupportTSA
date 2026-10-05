const test=require('node:test'),assert=require('node:assert/strict');
const T=require('../js/case-toolkit-core.js'),C=require('../js/case-notes-core.js'),S=require('../js/case-settings-core.js');
const legacyKey='dell-support.case-templates.v1';
test('note templates are gone from the toolkit API',()=>{
 for(const name of ['templates','templateHtml','templateNextHtml','templateCatalog','validateTemplates','loadTemplates','saveTemplates','templateStorageKey'])assert.equal(T[name],undefined,name);
 for(const [id,item] of Object.entries(T.issueTypes)){assert.ok(item.name.trim(),id);assert.ok(item.prompts.length>=6,id);}
});
test('custom issue IDs from former personal templates survive history backup',()=>{
 const state=C.empty(),note=C.create(state,'a',1000);note.toolkit.issueType='custom-deleted';note.notes='Keep my notes';
 const restored=C.parse(C.backup(state,2000));assert.equal(restored.cases[0].toolkit.issueType,'custom-deleted');
 assert.equal(restored.cases[0].notes,'Keep my notes');assert.ok(T.checklist(note).every(item=>typeof item.text==='string'));
});
test('settings no longer carry templates; older backups holding them still restore',()=>{
 const values=new Map([[legacyKey,JSON.stringify({boot:{name:'Storage checks',notes:'Check controller',next:''}})]]);
 const captured=S.capture({getItem:key=>values.get(key)??null});assert.equal(Object.hasOwn(captured,'templates'),false);
 const old=S.validate({fieldConfig:C.empty().fieldConfig,preferences:{templates:{boot:{name:'Bad'}},theme:'dark'}},C.fields);
 assert.equal(Object.hasOwn(old.values,legacyKey),false);assert.equal(old.values.theme,'dark');
});
test('Start Fresh erases template data left in storage',()=>{
 assert.equal(S.clearValues()[legacyKey],null);assert.ok(Object.hasOwn(S.clearValues(),legacyKey));
});
