const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('a screenshot still encoding after an entry switch cannot modify the new entry',async()=>{
 const nodes=new Map(); const get=id=>{if(!nodes.has(id))nodes.set(id,{listeners:{},addEventListener(k,f){this.listeners[k]=f;},querySelectorAll(){return [];},textContent:''});return nodes.get(id);};
 let finish,updates=0;const current={id:'case-a',activeEntryId:'entry-a',notes:'',next:'',images:{}};
 const ctx={window:{addEventListener(){},getSelection(){return {rangeCount:0};}},document:{getElementById:get,createElement(){return {getContext(){return {fillRect(){},drawImage(){}};},toDataURL(){return 'data:image/png;base64,aGVsbG8=';}};}},createImageBitmap:()=>new Promise(resolve=>{finish=resolve;}),console};
 vm.runInNewContext(fs.readFileSync(require.resolve('../case-markdown.js'),'utf8'),ctx);
 ctx.window.CaseMarkdown.init({current:()=>current,canEdit:()=>true,update(){updates++;}});
 const pending=get('notesRich').listeners.paste({preventDefault(){},clipboardData:{items:[{type:'image/png',getAsFile:()=>({size:10})}]}});
 current.activeEntryId='entry-b';finish({width:10,height:10,close(){}});await pending;
 assert.equal(updates,0);assert.match(get('notesImageStatus').textContent,/dated note changed/);
});
