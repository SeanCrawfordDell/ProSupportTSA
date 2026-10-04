const test=require('node:test'),assert=require('node:assert/strict');
const K=require('../js/knowledge-export.js');
test('exports the edited draft without importing hidden case details and escapes HTML',()=>{
 const result=K.article('Storage <review>','Issue:\n<script>alert(1)</script>\n\nResolution / workaround:\nKeep A & B');
 assert.match(result.markdown,/^# Storage <review>/);assert.match(result.markdown,/## Issue/);
 assert.ok(!result.html.includes('<script>'));assert.match(result.html,/&lt;script&gt;/);assert.match(result.html,/Keep A &amp; B/);
 assert.throws(()=>K.article('Title','  '),/draft/i);
});
test('Obsidian uses encoded destination and clipboard without silent overwrite or article in URL',()=>{
 const uri=K.obsidian('Work & Support','Draft: one?', '20260919-120000');
 const u=new URL(uri);assert.equal(u.protocol,'obsidian:');assert.equal(u.searchParams.get('vault'),'Work & Support');
 assert.equal(u.searchParams.get('clipboard'),'true');assert.equal(u.searchParams.has('content'),false);
 assert.equal(u.searchParams.has('overwrite'),false);assert.equal(u.searchParams.has('append'),false);
 assert.equal(u.searchParams.get('name'),'Draft one - 20260919-120000');
 assert.throws(()=>K.obsidian('  ','Title','stamp'),/vault/i);
 assert.equal(K.filename('CON'),'Knowledge draft');
});
function ui({fail=false,rich=true}={}){
 const nodes={},get=id=>nodes[id]??={value:'',textContent:'',hidden:true,listeners:{},addEventListener(k,f){this.listeners[k]=f},focus(){},select(){}};
 get('knowledgeTitle').value='Test article';get('obsidianVault').value='QA vault';
 let copied,notice;const env={document:{getElementById:get},navigator:{clipboard:{async writeText(t){if(fail)throw Error();copied=t},async write(t){if(fail)throw Error();copied=t}}},Blob,URL,ClipboardItem:rich?class {constructor(data){this.data=data}}:undefined};
 K.init({draft:()=> 'Issue:\nEdited draft',notify:t=>notice=t},env);
 return {get,click:id=>get(id).listeners.click(),copied:()=>copied,notice:()=>notice};
}
test('Obsidian link appears only after draft is copied and is invalidated when destination changes',async()=>{
 const h=ui();await h.click('knowledgeObsidian');assert.match(h.copied(),/Edited draft/);assert.equal(h.get('knowledgeOpenObsidian').hidden,false);
 h.get('obsidianVault').listeners.input();assert.equal(h.get('knowledgeOpenObsidian').hidden,true);
 const f=ui({fail:true});await f.click('knowledgeObsidian');assert.equal(f.get('knowledgeOpenObsidian').hidden,true);assert.match(f.notice(),/copy|clipboard/i);
});
test('OneNote copies HTML and plain text, with an explicit plain-text fallback',async()=>{
 const h=ui();await h.click('knowledgeOneNote');assert.ok(h.copied()[0].data['text/html']);assert.ok(h.copied()[0].data['text/plain']);assert.match(h.notice(),/paste/i);
 const plain=ui({rich:false});await plain.click('knowledgeOneNote');assert.equal(typeof plain.copied(),'string');assert.match(plain.notice(),/plain text/i);
 const fail=ui({fail:true});await fail.click('knowledgeOneNote');assert.match(fail.notice(),/Could not copy/);
});
test('Markdown download contains the edited article and uses a safe filename',async()=>{
 const nodes={},get=id=>nodes[id]??={value:'',hidden:true,addEventListener(k,f){this[k]=f}};
 get('knowledgeTitle').value='Disk: investigation?';let saved,anchor,revoked;
 const env={document:{getElementById:get,body:{append(){}},createElement(){return anchor={click(){this.clicked=true},remove(){}}}},Blob,URL:{createObjectURL(blob){saved=blob;return 'blob:test'},revokeObjectURL(url){revoked=url}},setTimeout(f){f()}};
 K.init({draft:()=> 'Issue:\nEdited content',notify(){}},env);get('knowledgeDownload').click();
 assert.equal(anchor.download,'Disk investigation.md');assert.ok(anchor.clicked);
 assert.match(await saved.text(),/## Issue\nEdited content/);assert.equal(revoked,'blob:test');
});
