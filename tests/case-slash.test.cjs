const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../js/case-slash-core.js');
const os={id:'os',label:'OS/Solution',options:[{value:'',text:'Select OS/Solution'},{value:'Redhat',text:'Redhat'},{value:'Ubuntu',text:'Ubuntu'},{value:'Windows Server',text:'Windows Server'},{value:'No OS',text:'No OS'}]};
const country={id:'country',label:'Customer Country',options:[{value:'US',text:'United States'},{value:'GB',text:'United Kingdom'},{value:'CA',text:'Canada'}]};
const fields=[{id:'tag',label:'Service Tag'},{id:'request',label:'Service Request Number'},os,country,{id:'notes',label:'Notes'},{id:'next',label:'Action Plan / Next Steps'},
  {id:'Asset',label:'Asset number',custom:true},{id:'st',label:'Custom st',custom:true},{id:'severity',label:'Custom severity',custom:true},{id:'severity',label:'Service Impact',options:[{value:'Unspecified',text:'Unspecified'},{value:'Deployment',text:'Deployment'}]}];
const list=S.commands(fields);
const code=c=>list.find(item=>item.code===c);

test('built-in fields get short codes; Notes and Action Plan get none',()=>{
  assert.deepEqual(list.map(item=>item.code),['st','sr','os','cc','asset','severity','sev']);
  assert.equal(code('st').id,'tag');assert.equal(code('st').label,'Service Tag');
  assert.equal(code('os').options.length,4,'the empty placeholder option is not offered');
});
test('custom fields use their id as the code, and never take a built-in code',()=>{
  assert.equal(code('asset').label,'Asset number');
  assert.equal(list.filter(item=>item.code==='st').length,1,'the custom "st" field is skipped');
  assert.equal(code('severity').label,'Custom severity');assert.equal(code('sev').label,'Service Impact');
  assert.equal(code('sev').field,fields.at(-1),'each command keeps the field it came from');
});
test('a line is a command only when it is a known code followed by a value',()=>{
  assert.deepEqual(S.parseLine('/st ABC1234',list),{cmd:code('st'),value:'ABC1234'});
  assert.deepEqual(S.parseLine('  /ST abc1234  ',list),{cmd:code('st'),value:'abc1234'},'case, padding and non-breaking spaces');
  assert.equal(S.parseLine('/sr 123 456',list).value,'123 456');
  assert.equal(S.parseLine('/st',list),null);assert.equal(S.parseLine('/st   ',list),null);
  assert.equal(S.parseLine('/xyz value',list),null);
  assert.equal(S.parseLine('Called customer /st ABC',list),null,'commands must start the line');
  assert.equal(S.parseLine('//st ABC',list),null);
});
test('the Service Tag is upper-cased and text values are trimmed',()=>{
  assert.deepEqual(S.resolveValue(code('st'),' abc1234 '),{ok:true,value:'ABC1234'});
  assert.deepEqual(S.resolveValue(code('sr'),' 0012345 '),{ok:true,value:'0012345'});
});
test('dropdown values match exactly, then by a unique prefix, then by a unique partial match',()=>{
  assert.deepEqual(S.resolveValue(code('os'),'ubuntu'),{ok:true,value:'Ubuntu',text:'Ubuntu'});
  assert.deepEqual(S.resolveValue(code('os'),'win'),{ok:true,value:'Windows Server',text:'Windows Server'});
  assert.deepEqual(S.resolveValue(code('os'),'server'),{ok:true,value:'Windows Server',text:'Windows Server'});
  assert.deepEqual(S.resolveValue(code('cc'),'us'),{ok:true,value:'US',text:'United States'},'country codes match the stored value');
  assert.deepEqual(S.resolveValue(code('cc'),'canada'),{ok:true,value:'CA',text:'Canada'});
  const ambiguous=S.resolveValue(code('cc'),'united');
  assert.equal(ambiguous.ok,false);assert.match(ambiguous.reason,/more than one Customer Country option: United States, United Kingdom/);
  const missing=S.resolveValue(code('os'),'solaris');
  assert.equal(missing.ok,false);assert.match(missing.reason,/not a OS\/Solution option\. Choose from: Redhat, Ubuntu, Windows Server, No OS/);
});
test('the Notes line becomes readable text, and suggestions follow what has been typed',()=>{
  assert.equal(S.plainText(code('os'),'Windows Server'),'OS/Solution: Windows Server');
  assert.deepEqual(S.suggest('/s',list).map(item=>item.code),['st','sr','severity','sev']);
  assert.equal(S.suggest('/',list).length,list.length);
  assert.deepEqual(S.suggest('/st ABC',list),[],'no suggestions once a value is being typed');
  assert.deepEqual(S.suggest('text /s',list),[]);
});
