const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Notes=require('../js/case-notes-core.js'),Slash=require('../js/case-slash-core.js');
const read=file=>fs.readFileSync(require.resolve('../'+file),'utf8');
const select=(html,id)=>{const m=new RegExp(`<select id="${id}"([^>]*)>([\\s\\S]*?)</select>`).exec(html);assert.ok(m,id+' select exists');return {attrs:m[1],options:[...m[2].matchAll(/<option(?: value="([^"]*)")?>([^<]*)<\/option>/g)].map(o=>({value:o[1]??o[2],text:o[2]}))};};
const pages=['case-notes.html','escalation-quality.html'];

test('Customer Country is sorted by name on both pages, with the prompt first and Other last',()=>{
 for(const page of pages){
  const {options}=select(read(page),'country');
  assert.equal(options[0].value,'');assert.equal(options.at(-1).value,'Other');
  const names=options.slice(1,-1).map(o=>o.text);
  assert.deepEqual(names,[...names].sort((a,b)=>a.localeCompare(b,'en')),page+' is alphabetical');
  assert.equal(names[0],'Argentina');assert.ok(names.includes('United States')&&names.includes('United Arab Emirates'));
 }
});
test('both pages keep the same country codes and offer the search list',()=>{
 const [a,b]=pages.map(page=>select(read(page),'country'));
 assert.deepEqual(a.options,b.options);
 for(const page of pages){
  const html=read(page);
  assert.match(select(html,'country').attrs,/\bdata-searchable\b/);
  assert.match(html,/<script src="js\/searchable-select\.js\?v=[^"]+" defer><\/script>/);
 }
 assert.doesNotMatch(select(read('case-notes.html'),'timezone').attrs,/data-searchable/);
});
test('the search list leaves the select where it is and reports choices through its own events',()=>{
 const code=read('js/searchable-select.js');
 assert.match(code,/dispatchEvent\(new Event\("input"/);assert.match(code,/dispatchEvent\(new Event\("change"/);
 assert.doesNotMatch(code,/innerHTML|insertBefore|replaceWith\(select|appendChild\(select\)/,'never rewrites or relocates the select');
});

test('Case Notes asks for the customer time zone, using the same choices as the escalation page',()=>{
 const notes=select(read('case-notes.html'),'timezone'),escalation=select(read('escalation-quality.html'),'timezone');
 assert.deepEqual(notes.options,escalation.options);
 assert.equal(Notes.fields.timezone,'What Timezone Does the Customer Want to Work In?');
 const html=read('case-notes.html');
 assert.ok(html.indexOf('id="country"')<html.indexOf('id="timezone"')&&html.indexOf('id="timezone"')<html.indexOf('id="supportType"'),'sits beside Customer Country');
});
test('new cases start with no time zone, older saved cases load with one, and it saves',()=>{
 const state=Notes.empty(),note=Notes.create(state,'tz',100);state.cases=[note];
 assert.equal(note.timezone,'');
 const saved=JSON.parse(JSON.stringify(state));delete saved.cases[0].timezone;
 assert.equal(Notes.parse(JSON.stringify(saved)).cases[0].timezone,'');
 note.timezone='US Pacific (PT, UTC−8/−7)';
 assert.equal(Notes.parse(JSON.stringify(state)).cases[0].timezone,'US Pacific (PT, UTC−8/−7)');
 assert.match(Notes.copyText(note,100),/What Timezone Does the Customer Want to Work In\?:\nUS Pacific/);
});
test('Escalate to DE carries the time zone across, and a case without one leaves it blank',()=>{
 const state=Notes.empty(),note=Notes.create(state,'tz2',100);
 assert.equal(Notes.escalation(note,100).timezone,'');
 note.timezone='India (IST, UTC+5:30)';assert.equal(Notes.escalation(note,100).timezone,'India (IST, UTC+5:30)');
});
test('/tz fills the time zone and accepts part of an option',()=>{
 const options=select(read('case-notes.html'),'timezone').options,list=Slash.commands([{id:'timezone',label:Notes.fields.timezone,options}]);
 assert.equal(list[0].code,'tz');
 assert.deepEqual(Slash.resolveValue(list[0],'pacific'),{ok:true,value:'US Pacific (PT, UTC−8/−7)',text:'US Pacific (PT, UTC−8/−7)'});
 assert.equal(Slash.resolveValue(list[0],'us').ok,false,'more than one match is rejected');
});
