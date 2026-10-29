const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const P=require('../js/portfolio-core.js');
const read=path=>fs.readFileSync(require.resolve('../'+path),'utf8');
const catalog={tools:[
 {id:'t1',name:'Alpha',owner:'Pat Lee',status:'released',progress:100,category:'Utility',operatingSystem:['Windows','ESX']},
 {id:'t2',name:'Bravo',owner:'pat.lee@dell.com',status:'development',progress:40,category:'Diagnostics'},
 {id:'t3',name:'Charlie',owner:'Ana Ruiz',status:'internal-testing',progress:'Working Prototype',category:'Diagnostics'},
 {id:'t4',name:'Delta',status:'maintenance',roadmap:[{feature:'Old',status:'planned'}]},
 {id:'t5',name:'Echo',owner:'Ana Ruiz',status:'retired'}
]};
const tools=P.load(catalog,'https://example.test/ISGToolsCatalog/');

test('catalog records become rows with the catalog\'s own status labels',()=>{
 assert.deepEqual(tools.map(t=>t.statusLabel),['Released','Development','Internal Testing','Maintenance','Retired']);
 assert.equal(tools[4].status,'other','unknown statuses keep their name but sit in Other');
 assert.equal(tools[1].owner,'Pat Lee','email owners read as names, so one person is one owner');
 assert.equal(tools[3].owner,P.unassigned);assert.equal(tools[3].category,'Uncategorized');
 assert.equal(tools[0].os,'Windows, ESX');assert.equal(tools[0].link,'https://example.test/ISGToolsCatalog/#/tools/t1');
 assert.deepEqual([tools[1].percent,tools[1].progressLabel],[40,'40%']);
 assert.deepEqual([tools[2].percent,tools[2].progressLabel],[null,'Working Prototype']);
 assert.equal(P.normalize({},2).name,'Untitled tool');assert.equal(P.normalize({},2).id,'tool-3');
 for(const key of ['health','updated','stage','tasksDone','target','note'])assert.ok(!(key in tools[3]),'no '+key+': roadmap, health and updated are gone');
 assert.throws(()=>P.parseCatalog({nope:1}));assert.equal(P.parseCatalog([{name:'x'},null]).length,1);
});

test('summary counts released, testing, development and owners',()=>{
 const s=P.summary(tools);
 assert.deepEqual([s.total,s.released,s.testing,s.inDevelopment,s.owners],[5,2,1,1,2]);
 assert.deepEqual(s.statuses.map(x=>x.label),['Idea','Planning','Development','Testing','Internal Testing','Released','Maintenance','Other']);
 assert.equal(P.summary(tools.slice(0,3)).statuses.length,7,'Other appears only when a tool needs it');
});

test('the table groups by Development Status, Owner or Category',()=>{
 assert.deepEqual(P.groupings,['Development Status','Owner','Category']);
 assert.deepEqual(P.groups(tools).map(g=>g.name),['Development','Internal Testing','Released','Maintenance','Other']);
 assert.deepEqual(P.groups(tools,'Owner').map(g=>g.name),[P.unassigned,'Ana Ruiz','Pat Lee']);
 assert.deepEqual(P.groups(tools,'Category').map(g=>g.name),['Diagnostics','Utility','Uncategorized']);
});

test('the board has every status and the owner list counts each status',()=>{
 assert.deepEqual(P.columns(tools.slice(0,3)).map(c=>c.name),P.statuses.map(s=>s.label));
 const ana=P.owners(tools).find(o=>o.name==='Ana Ruiz');
 assert.deepEqual(ana.byStatus.map(s=>s.label+':'+s.count),['Internal Testing:1','Other:1']);
 assert.equal(P.initials('Pat Lee'),'PL');assert.equal(P.initials(P.unassigned),'?');
});

test('the filter searches name, owner, status, category and description',()=>{
 assert.equal(tools.filter(t=>P.matches(t,'pat')).length,2);
 assert.equal(tools.filter(t=>P.matches(t,'internal testing')).length,1);
 assert.equal(tools.filter(t=>P.matches(t,'')).length,5);
});

test('the page reads the live catalog first and falls back to the saved copy',()=>{
 const html=read('portfolio.html'),js=read('js/portfolio.js'),data=require('../js/portfolio-data.js');
 assert.equal(data.liveUrl,'../ISGToolsCatalog/tools.json','the catalog sits beside this site on the same Pages host');
 assert.match(js,/fetch\(new URL\(data\.liveUrl, location\.href\), \{ cache: "no-store"/);
 assert.match(js,/tools = P\.load\(data, catalogUrl\)/,'falls back to the saved copy');
 assert.ok(data.tools.length>0&&data.snapshotDate);
 assert.ok(!/innerHTML|insertAdjacentHTML/.test(js),'no HTML parsing of catalog data');
 for(const word of ['Health','On track','At risk','Off track','Stale','Updated','Stage'])assert.ok(!new RegExp('\\b'+word+'\\b').test(html+js),word+' is gone from the page');
 assert.match(html,/Development Status|development status/);assert.match(js,/"Development Status"/);
 assert.match(html,/<header class="site-header" id="siteTopbar" data-page="portfolio"><\/header>\s*<script src="js\/site-topbar\.js\?v=[^"]+"><\/script>/);
 for(const file of ['js/portfolio-core.js','js/portfolio-data.js','js/portfolio.js','css/portfolio.css'])assert.ok(html.includes(file+'?v='),file);
 for(const id of ['portfolioNotice','loadingState','emptyState','dashboard','stageBar','stageLegend','toolFilter','groupBy','groupControl','resultCount','metricTotal','metricReleased','metricTesting','metricDevelopment','metricOwners','sourceLink','tab-portfolio','tab-pipeline','tab-owners','panel-portfolio','panel-pipeline','panel-owners'])assert.ok(html.includes(`id="${id}"`),id);
 assert.match(read('js/site-topbar.js'),/\["portfolio\.html", "Tool Portfolio"\]/);
});

test('the sync script saves only the catalog fields the page uses',()=>{
 const S=require('../scripts/sync-portfolio-from-catalog.cjs');
 const data=S.build(catalog,'2026-10-29');
 assert.equal(data.snapshotDate,'2026-10-29');assert.equal(data.liveUrl,'../ISGToolsCatalog/tools.json');
 assert.ok(!('roadmap' in data.tools[3]));assert.deepEqual(Object.keys(data.tools[0]),['id','name','category','owner','status','progress','operatingSystem']);
 const loaded={};new Function('window','module',S.render(data))(loaded,undefined);
 assert.equal(loaded.PortfolioData.tools.length,5,'the generated file loads in the browser');
 assert.throws(()=>S.build({},'2026-10-29'));
});
