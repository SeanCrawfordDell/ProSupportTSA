const test = require('node:test');
const assert = require('node:assert/strict');
const install = require('../js/case-tooltips.js');
function setup() {
  const events={},timers=new Map();let now=0,id=0;
  function node(tag='button') {
    const attrs=new Map();
    return {tagName:tag.toUpperCase(),style:{},hidden:false,isConnected:true,textContent:'',
      setAttribute(k,v){attrs.set(k,v);},getAttribute(k){return attrs.get(k)??null;},removeAttribute(k){attrs.delete(k);},
      closest(selector){return selector==='dialog[open]'?null:this.tagName==='BUTTON'?this:null;},
      contains(other){return this===other;},matches(){return true;},
      getBoundingClientRect(){return {left:100,right:150,top:80,bottom:110,width:50,height:30};},
      querySelectorAll(){return [];},append(child){this.child=child;}};
  }
  const button=node();button.setAttribute('title','Helpful action');button.setAttribute('aria-describedby','existing');
  const body=node('body');
  const document={body,createElement:()=>node('div'),querySelectorAll:()=>[button],addEventListener(k,f){events[k]=f;}};
  const window={innerWidth:800,innerHeight:600,addEventListener(k,f){events[k]=f;},setTimeout(f,ms){timers.set(++id,{f,at:now+ms});return id;},clearTimeout(id){timers.delete(id);}};
  install(document,window);
  return {button,body,events,tick(ms){now+=ms;for(const [key,t] of [...timers])if(t.at<=now){timers.delete(key);t.f();}}};
}
test('mouse hover waits 200ms and replaces native title with an accessible tooltip',()=>{
  const h=setup();assert.equal(h.button.getAttribute('title'),null);
  h.events.pointerover({target:h.button,pointerType:'mouse'});h.tick(199);assert.equal(h.body.child,undefined);
  h.tick(1);assert.equal(h.body.child.textContent,'Helpful action');assert.equal(h.body.child.hidden,false);
  assert.match(h.button.getAttribute('aria-describedby'),/existing case-fast-tooltip/);
  h.events.keydown({key:'Escape'});assert.equal(h.body.child.hidden,true);assert.equal(h.button.getAttribute('aria-describedby'),'existing');
});
test('leaving before the delay cancels tooltips and touch never schedules them',()=>{
  const h=setup();h.events.pointerover({target:h.button,pointerType:'mouse'});
  h.events.pointerout({target:h.button,relatedTarget:null});h.tick(300);assert.equal(h.body.child,undefined);
  h.events.pointerover({target:h.button,pointerType:'touch'});h.tick(300);assert.equal(h.body.child,undefined);
});
test('keyboard focus shows help immediately and blur dismisses it',()=>{
  const h=setup();h.events.focusin({target:h.button});assert.equal(h.body.child.hidden,false);
  h.events.focusout({target:h.button});assert.equal(h.body.child.hidden,true);
});
