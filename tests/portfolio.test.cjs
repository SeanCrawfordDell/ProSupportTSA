const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const P=require('../js/portfolio-core.js');
const read=path=>fs.readFileSync(require.resolve('../'+path),'utf8');
const now=Date.parse('2026-10-28T12:00:00Z');
const tools=[
 {name:'Alpha',owner:'Pat Lee',stage:'Build',health:'On track',tasksDone:5,tasksTotal:10,updated:'2026-10-27'},
 {name:'Bravo',owner:'Pat Lee',stage:'Test',health:'Off track',tasksDone:1,tasksTotal:4,updated:'2026-10-01'},
 {name:'Charlie',owner:'Ana Ruiz',stage:'Build',health:'At risk',tasksDone:0,tasksTotal:0},
 {name:'Delta',stage:'release',health:'on track',tasksDone:3,tasksTotal:3,updated:'2026-10-28'}
].map(P.normalize);

test('records are cleaned instead of failing the page',()=>{
 const t=P.normalize({name:'  X ',stage:'nope',health:'??',tasksDone:9,tasksTotal:4,link:'javascript:alert(1)',updated:'bad'},2);
 assert.equal(t.name,'X');assert.equal(t.id,'tool-3');assert.equal(t.stage,'Intake');assert.equal(t.health,'On track');
 assert.equal(t.tasksDone,4,'done never exceeds total');assert.equal(t.link,'','only http(s) links');assert.equal(t.updated,'');assert.equal(t.owner,P.unassigned);
 assert.equal(P.normalize({}).name,'Untitled tool');
 assert.equal(tools[3].stage,'Release');assert.equal(tools[3].health,'On track','case-insensitive values');
});

test('summary counts health, stale rows and every stage',()=>{
 const s=P.summary(tools,7,now);
 assert.deepEqual([s.total,s.onTrack,s.atRisk,s.offTrack],[4,2,1,1]);
 assert.equal(s.stale,2,'Bravo is 27 days old and Charlie was never reviewed');
 assert.deepEqual(s.stages.map(x=>x.name),P.stages);
 assert.equal(s.stages.find(x=>x.name==='Build').count,2);
 assert.equal(P.updatedLabel(tools[0],now),'Yesterday');assert.equal(P.updatedLabel(tools[2],now),'Never');assert.equal(P.updatedLabel(tools[3],now),'Today');
});

test('the table groups put problems first and skip empty groups',()=>{
 assert.deepEqual(P.groups(tools,'Health').map(g=>g.name),['Off track','At risk','On track']);
 assert.deepEqual(P.groups(tools,'Stage').map(g=>g.name),['Build','Test','Release']);
 assert.deepEqual(P.groups(tools,'Stage')[0].tools.map(t=>t.name),['Charlie','Alpha'],'At risk before On track within a stage');
 assert.deepEqual(P.groups(tools,'Owner').map(g=>g.name),[P.unassigned,'Pat Lee','Ana Ruiz']);
});

test('the board has every stage and the owner list shows who needs help first',()=>{
 const cols=P.columns(tools);
 assert.deepEqual(cols.map(c=>c.name),P.stages);
 assert.equal(cols.find(c=>c.name==='Build').attention,1);
 const owners=P.owners(tools);
 assert.equal(owners[0].name,P.unassigned,'unowned tools are always first');
 assert.equal(owners[1].name,'Pat Lee');assert.equal(owners[1].off,1);assert.equal(owners[1].openTasks,8);
 assert.equal(P.initials('Pat Lee'),'PL');assert.equal(P.initials(P.unassigned),'?');
 assert.equal(P.percent(tools[0]),50);assert.equal(P.percent(tools[2]),0);
});

test('the filter searches name, owner, stage, health and note',()=>{
 assert.equal(tools.filter(t=>P.matches(t,'pat')).length,2);
 assert.equal(tools.filter(t=>P.matches(t,'OFF TRACK')).length,1);
 assert.equal(tools.filter(t=>P.matches(t,'')).length,4);
});

test('the page is wired into the site and builds catalog text with DOM methods only',()=>{
 const html=read('portfolio.html');
 assert.match(html,/<header class="site-header" id="siteTopbar" data-page="portfolio"><\/header>\s*<script src="js\/site-topbar\.js\?v=[^"]+"><\/script>/);
 for(const file of ['js/portfolio-core.js','js/portfolio-data.js','js/portfolio.js','css/portfolio.css'])assert.ok(html.includes(file+'?v='),file);
 for(const id of ['emptyState','dashboard','stageBar','stageLegend','toolFilter','groupBy','groupControl','resultCount','metricTotal','metricOn','metricRisk','metricOff','metricStale','tab-portfolio','tab-pipeline','tab-owners','panel-portfolio','panel-pipeline','panel-owners'])assert.ok(html.includes(`id="${id}"`),id);
 assert.ok(!/innerHTML|insertAdjacentHTML/.test(read('js/portfolio.js')),'no HTML parsing of catalog data');
 assert.match(read('js/site-topbar.js'),/\["portfolio\.html", "Tool Portfolio"\]/);
 assert.match(read('index.html'),/<a href="portfolio\.html">Tool Portfolio<\/a>/);
 const data=require('../js/portfolio-data.js');assert.ok(Array.isArray(data.tools));
});
