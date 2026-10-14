// Every saved-history format Case Notes has ever written must still load. Fixtures in tests/fixtures/history were
// written by the actual code of each release (scripts/make-history-fixture.cjs); add one whenever the format changes.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../js/case-notes-core.js');
const dir=path.join(__dirname,'fixtures','history');
const fixtures=fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort().map(f=>({file:f,...JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'))}));
const ids=s=>['cases','archive','trash'].flatMap(k=>(s[k]||[]).map(n=>n.id)).sort();
test('history fixtures cover every storage format from the first release',()=>{
 assert.ok(fixtures.length>=9);
 assert.deepEqual([...new Set(fixtures.map(f=>f.history.version))].sort(),[1,2,3]);
});
for(const fixture of fixtures) test(`history saved by ${fixture.file} loads with every case and its content`,()=>{
 const raw=JSON.stringify(fixture.history),state=C.parse(raw);
 assert.equal(state.version,3);
 assert.deepEqual(ids(state),ids(fixture.history),'no case is lost');
 const a=[...state.cases,...state.archive].find(n=>n.id==='case-a');
 assert.equal(a.tag,'AAA1001');assert.match(C.plainText?C.plainText(a.issue):a.issue,/VMs lose network/);
 if(fixture.features.includes('custom field'))assert.equal(a.siteName,'Lab 2');
 if(fixture.features.includes('toolkit'))assert.equal(a.toolkit.owner,'Customer');
 if(fixture.features.includes('workflow'))assert.equal(a.toolkit.workflow.fix,'Rolled the driver back');
 assert.deepEqual(C.parse(JSON.stringify(state)),state,'it saves and reloads unchanged');
 const repaired=C.repair(raw,Date.now());assert.equal(repaired.setAside.length,0);assert.equal(repaired.kept,ids(fixture.history).length);
});
