const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../js/case-notes-core.js');
const S=require('../js/case-settings-core.js');
test('inherited-property case IDs can be edited and checkpointed',()=>{
  for(const id of ['toString','valueOf','hasOwnProperty']){
    const s=C.empty();C.create(s,id,1);const previous=C.parse(JSON.stringify(s));
    s.cases[0].notes='edited';C.checkpoint(s,previous,2);
    assert.equal(s.revisions[id][0].note.notes,'');
    assert.equal(C.parse(JSON.stringify(s)).cases[0].notes,'edited');
  }
});
test('field removal purges every collection and does not resurrect deleted values in checkpoints',()=>{
  const s=C.empty();C.addCustomField(s,'contact','Contact');
  for(const id of ['recent','archive','trash']){const n=C.create(s,id,1);n.contact='private';if(id!=='recent')C.move(s,id,'cases',id,2);}
  const previous=C.parse(JSON.stringify(s));s.cases[0].notes='change';C.checkpoint(s,previous,3);
  C.removeCustomField(s,'contact');C.checkpoint(s,previous,4);
  for(const n of [...s.cases,...s.archive,...s.trash,...Object.values(s.revisions).flat().map(v=>v.note)])assert.equal(Object.hasOwn(n,'contact'),false);
});
test('reset fields removes values from all collections and versions',()=>{
  const s=C.empty();C.addCustomField(s,'contact','Contact');C.create(s,'case',1).contact='private';
  const previous=C.parse(JSON.stringify(s));s.cases[0].notes='change';C.checkpoint(s,previous,3);
  C.resetCustomFields(s);C.checkpoint(s,previous,4);
  assert.deepEqual(s.fieldConfig.customFields,{});
  assert.equal(Object.hasOwn(s.cases[0],'contact'),false);
  assert.ok(s.revisions.case.every(v=>!Object.hasOwn(v.note,'contact')));
});
test('legacy long labels remain restorable and new labels are bounded',()=>{
  const s=C.empty();s.fieldConfig.customFields.legacy='x'.repeat(121);s.fieldConfig.order.push('legacy');
  assert.equal(S.validate({fieldConfig:s.fieldConfig},C.fields).fieldConfig.customFields.legacy.length,121);
  assert.throws(()=>C.addCustomField(s,'newfield','x'.repeat(121)),/120/);
  assert.throws(()=>C.addCustomField(s,'blank',' '));
});
test('plain text email includes custom fields in configured order',()=>{
  const s=C.empty();C.addCustomField(s,'contact','Customer contact');const n=C.create(s,'case',1);n.contact='QA value';
  const eml=C.emailFile(n,2,{html:'<p>QA value</p>',images:{}},'qa',s.fieldConfig);
  const body=eml.split('Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0];
  assert.match(Buffer.from(body.replace(/\s/g,''),'base64').toString(),/Customer contact:\nQA value/);
});
