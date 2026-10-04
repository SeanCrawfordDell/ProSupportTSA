const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
// A small DOM: parses the rendered markup into nested elements so containment and focus work.
function harness(page){
 const nodes={},docEvents={},body={classList:{has:new Set(),contains(k){return this.has.has(k);}}};
 body.classList.contains=body.classList.contains.bind(body.classList);
 function element(tag,attrs,parent){
  const node={tagName:tag.toUpperCase(),attributes:{...attrs},parent,children:[],handlers:{},hidden:'hidden' in attrs,disabled:'disabled' in attrs,id:attrs.id,
   setAttribute(k,v){this.attributes[k]=v;},getAttribute(k){return this.attributes[k]??null;},
   addEventListener(k,f){this.handlers[k]=f;},focus(){document.activeElement=this;},
   contains(other){for(let n=other;n;n=n.parent)if(n===this)return true;return false;},
   closest(selector){for(let n=this;n;n=n.parent)if(selector.split(',').some(s=>n.tagName===s.trim().toUpperCase()))return n;return null;},
   querySelectorAll(selector){const tags=selector.split(',').map(s=>s.trim().toUpperCase()),out=[];const walk=n=>n.children.forEach(c=>{if(tags.includes(c.tagName))out.push(c);walk(c);});walk(this);return out;}};
  if(attrs.id)nodes[attrs.id]=node;parent?.children.push(node);return node;
 }
 const header=element('header',{id:'siteTopbar'},null);header.dataset={page};
 Object.defineProperty(header,'innerHTML',{set(html){
  const stack=[header];
  for(const [,close,tag,rest] of html.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>/gi)){
   if(close){stack.pop();continue;}
   const attrs={};for(const [,k,v] of rest.matchAll(/([a-z-]+)(?:="([^"]*)")?/gi))attrs[k]=v??'';
   const node=element(tag,attrs,stack.at(-1));
   if(!rest.trim().endsWith('/'))stack.push(node);
  }
 }});
 const document={body,activeElement:null,getElementById:id=>nodes[id]??null,addEventListener:(k,f)=>docEvents[k]=f};
 const window={};
 vm.runInNewContext(fs.readFileSync(require.resolve('../site-topbar.js'),'utf8'),{window,document,encodeURIComponent});
 const click=(id,target)=>{const node=nodes[id];node.handlers.click?.({target:target||node});docEvents.click?.({target:target||node});};
 return {nodes,document,body,window,docEvents,click,get:id=>nodes[id]};
}
const ids=markup=>[...markup.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
test('Case Notes and Escalation Quality render the same top bar',()=>{
 const {window}=harness('case-notes'),T=window.SiteTopbar;
 const notes=T.markup('case-notes'),escalation=T.markup('escalation');
 const shared=list=>list.filter(id=>!['loadExampleNote','loadWeak','loadStrong'].includes(id));
 assert.deepEqual(shared(ids(notes)),shared(ids(escalation)),'same menus and controls in the same order');
 for(const markup of [notes,escalation]){
  assert.ok(/Tools Hub[\s\S]*Troubleshooting Guides[\s\S]*ISG Tools Catalog[\s\S]*Microsoft Support Tools/.test(markup));
  assert.ok(/id="tutorialDemo"[^>]*>Tutorial Demo/.test(markup));
  assert.ok(/Customize Fields[\s\S]*Backup &amp; Restore/.test(markup));
  assert.ok(/Request feature \/ Report bug/.test(markup));
 }
 assert.match(notes,/id="loadExampleNote"[^>]*disabled/);
 assert.match(escalation,/id="loadWeak"[^>]*>Load Weak Example[\s\S]*id="loadStrong"[^>]*>Load Strong Example/);
 // Site settings live in Case Notes; Escalation links straight to them.
 assert.match(notes,/<button class="dropdown-item" id="openBackupRestore"/);
 assert.match(escalation,/<a class="dropdown-item" id="customizeFields" href="case-notes.html#customize-fields"/);
 assert.match(escalation,/<a class="dropdown-item" id="openBackupRestore" href="case-notes.html#backup-restore"/);
 // Feedback issues are labelled with the page they came from.
 assert.match(notes,/title=%5BCase%20Notes%5D%20&amp;body=[^"]*Page%3A\*\*%20Case%20Notes/);
 assert.match(escalation,/title=%5BEscalation%20Quality%5D%20&amp;body=[^"]*Page%3A\*\*%20Escalation%20Quality/);
});
test('both pages load the shared top bar and keep no copy of their own',()=>{
 for(const [file,page] of [['../case-notes.html','case-notes'],['../escalation-quality.html','escalation']]){
  const html=fs.readFileSync(require.resolve(file),'utf8');
  assert.match(html,new RegExp(`<header class="topbar" id="siteTopbar" data-page="${page}"></header>\\s*<script src="site-topbar\\.js\\?v=[^"]+"></script>`),file+' renders the bar before its deferred scripts run');
  assert.match(html,/<link rel="stylesheet" href="site-topbar\.css\?v=[^"]+">/);
  for(const id of ['openToolsMenu','openTraining','openSettingsMenu','themeToggle','requestFeature','tutorialDemo'])assert.ok(!html.includes(`id="${id}"`),file+' has no own '+id);
  assert.equal((html.match(/class="topbar"/g)||[]).length,1);
 }
 const versions=['../case-notes.html','../escalation-quality.html'].map(f=>/site-topbar\.js\?v=([^"]+)"/.exec(fs.readFileSync(require.resolve(f),'utf8'))[1]);
 assert.equal(versions[0],versions[1]);
 assert.equal(/triggerId:"([^"]+)"/.exec(fs.readFileSync(require.resolve('../escalation-demo.js'),'utf8'))[1],'tutorialDemo');
 assert.ok(!fs.readFileSync(require.resolve('../escalation-quality.html'),'utf8').includes('hero-actions'),'tour and samples moved into Training');
});
test('menus open one at a time and close on a choice, an outside click, or Escape',()=>{
 for(const page of ['case-notes','escalation']){
  const h=harness(page);
  h.click('openToolsMenu');assert.equal(h.get('toolsMenuList').hidden,false);assert.equal(h.get('openToolsMenu').attributes['aria-expanded'],'true');
  h.click('openTraining');assert.equal(h.get('trainingMenuList').hidden,false);assert.equal(h.get('toolsMenuList').hidden,true,'opening one closes the other');
  h.get('trainingMenuList').handlers.click({target:h.get('tutorialDemo')});assert.equal(h.get('trainingMenuList').hidden,true,'a choice closes the menu');
  h.click('openSettingsMenu');h.docEvents.click({target:h.document.body});assert.equal(h.get('settingsMenuList').hidden,true,'outside click closes');
  h.click('openToolsMenu');h.docEvents.keydown({key:'Escape'});
  assert.equal(h.get('toolsMenuList').hidden,true);assert.equal(h.document.activeElement,h.get('openToolsMenu'),'Escape returns focus to the toggle');
  let prevented=false;h.get('openSettingsMenu').handlers.keydown({key:'ArrowDown',preventDefault(){prevented=true;}});
  assert.ok(prevented);assert.equal(h.get('settingsMenuList').hidden,false);
  assert.equal(h.document.activeElement,h.get(page==='case-notes'?'openBackupRestore':'customizeFields'),'ArrowDown focuses the first enabled item');
  h.window.SiteTopbar.closeMenus();assert.ok(['tools','training','settings'].every(n=>h.get(n+'MenuList').hidden));
 }
});
test('menus stay open while the tutorial is showing them',()=>{
 const h=harness('case-notes');h.click('openSettingsMenu');
 h.body.classList.has.add('tour-running');h.docEvents.click({target:h.document.body});
 assert.equal(h.get('settingsMenuList').hidden,false);
 h.body.classList.has.delete('tour-running');h.docEvents.click({target:h.document.body});
 assert.equal(h.get('settingsMenuList').hidden,true);
});
