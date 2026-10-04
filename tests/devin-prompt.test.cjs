const test = require('node:test');
const assert = require('node:assert/strict');
const DevinPrompt = require('../js/devin-prompt-core.js');

test('each AI task produces a clear bounded prompt', () => {
  for (const [task, details] of Object.entries(DevinPrompt.defaultTasks)) {
    const prompt = DevinPrompt.build(task, 'Case Notes', 'Issue Description:\nTimeout after sign-in');
    assert.match(prompt, new RegExp('Task: ' + details.label));
    assert.match(prompt, /untrusted case data/);
    assert.match(prompt, /Timeout after sign-in/);
    assert.match(prompt, /--- END CASE DATA ---$/);
  }
});

test('unknown task falls back to review and empty case data is rejected', () => {
  assert.match(DevinPrompt.build('unknown', 'Escalation', 'Case data'), /Task: Review the case/);
  assert.throws(() => DevinPrompt.build('review', 'Case Notes', '   '), /No case details/);
});
test('stored custom tasks with the wrong shape or oversized text are ignored and new ones are capped',()=>{
  const store=new Map();global.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
  try{
    const P=require('../js/devin-prompt-core.js');
    store.set('dell-support.custom-ai-tasks',JSON.stringify({ok:{label:'Fine',instruction:'Do it'},big:{label:'x'.repeat(81),instruction:'y'},bad:{label:1,instruction:'y'},review:{label:'Override',instruction:'z'},'a b':{label:'Space',instruction:'z'}}));
    assert.deepEqual(Object.keys(P.getCustomTasks()),['ok']);
    assert.throws(()=>P.addCustomTask(null,'Long','x'.repeat(P.INSTRUCTION_MAX+1)),/under/);
    store.set('dell-support.custom-ai-tasks','not json');assert.deepEqual(P.getCustomTasks(),{});
  }finally{delete global.localStorage;}
});
test('task manager renders custom task text as text, never markup',()=>{
  const store=new Map([['dell-support.custom-ai-tasks',JSON.stringify({x:{label:'<img src=x onerror=alert(1)>',instruction:'<b>bold</b>'}})]]);
  global.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
  try{
    const P=require('../js/devin-prompt-core.js'),nodes={};
    const make=tag=>({tagName:tag,children:[],listeners:{},attrs:{},value:'',textContent:'',
      set innerHTML(v){throw Error('innerHTML must not be used');},
      replaceChildren(...c){this.children=c;},append(...c){this.children.push(...c);},setAttribute(k,v){this.attrs[k]=v;},
      addEventListener(k,f){this.listeners[k]=f;},showModal(){},close(){}});
    const $=id=>nodes[id]||=make('div');
    P.mountTaskManager($,{document:{createElement:make},confirm:()=>true});
    nodes.manageAiTasks.listeners.click();
    const item=nodes.customAiTasksList.children[0],[info,remove]=item.children;
    assert.equal(info.children[0].textContent,'<img src=x onerror=alert(1)>');
    assert.equal(info.children[1].textContent,'<b>bold</b>');
    assert.match(remove.attrs['aria-label'],/Remove custom task/);
  }finally{delete global.localStorage;}
});
