const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=path=>fs.readFileSync(require.resolve('../'+path),'utf8');
test('note sanitizer allows only listed attributes, so class and srcset never survive',()=>{
  const source=read('js/case-markdown.js');
  const allowed=JSON.parse(/ALLOWED_ATTR: (\[[^\]]*\])/.exec(source)[1]);
  for(const attr of ['class','srcset','style','id','name','onerror'])assert.ok(!allowed.includes(attr),attr);
  for(const attr of ['href','src','alt','width'])assert.ok(allowed.includes(attr),attr);
  assert.match(source,/ALLOW_DATA_ATTR: false/);
  assert.match(read('js/case-notes.js'),/printArea\.replaceChildren\(window\.CaseMarkdown\.sanitize\(/,'print uses the same sanitizer');
});
test('every page refuses to render inside another site\'s frame',()=>{
  const run=framed=>{
    const self={location:{href:'https://example.test/case-notes.html'}},top=framed?{location:''}:self;
    const style={},window=Object.assign(self,{top,self,matchMedia:()=>({matches:false,addEventListener(){}}),addEventListener(){}});
    vm.runInNewContext(read('js/theme.js'),{window,document:{documentElement:{style,setAttribute(){}},getElementById:()=>null,addEventListener(){}},localStorage:{getItem:()=>null}});
    return {style,top};
  };
  const framed=run(true);assert.equal(framed.style.display,'none');assert.equal(framed.top.location,'https://example.test/case-notes.html');
  assert.equal(run(false).style.display,undefined);
  for(const page of fs.readdirSync(require.resolve('../index.html').replace(/index\.html$/,'')).filter(n=>n.endsWith('.html'))){
    const html=read(page);if(!html.includes('js/theme.js'))continue;
    assert.ok(html.indexOf('js/theme.js')<html.indexOf('<body'),page+' loads theme.js in the head');
  }
});
