"use strict";
window.GuidedTour = (() => {
  // Steps marked core:true form a short first tour; the rest are offered afterwards as "More features".
  function create({triggerId,steps:allSteps,finishLabel="Finish tour",onStart,onFinish}) {
    const $=id=>document.getElementById(id),dialog=$("featureDemo"),trigger=$(triggerId);
    const core=allSteps.filter(step=>step.core),extra=core.length?allSteps.filter(step=>!step.core):[];
    let index=0,active=false,target=null,undo=[],originalScroll=0,context,steps=core.length?core:allSteps;
    const offerMore=()=>steps===core&&extra.length>0&&index===steps.length-1;
    const shield=document.createElement("div"),spotlight=document.createElement("div");
    shield.className="tour-shield";spotlight.className="tour-spotlight";
    shield.hidden=spotlight.hidden=true;spotlight.setAttribute("aria-hidden","true");
    document.body.append(shield,spotlight);
    function restoreStep(){for(const reset of undo.reverse())reset();undo=[];}
    function reveal(element){
      for(let node=element;node && node!==document.body;node=node.parentElement){
        if(node.hidden){node.hidden=false;const saved=node;undo.push(()=>{saved.hidden=true;});}
        if(node.tagName==="DETAILS" && !node.open){node.open=true;const saved=node;undo.push(()=>{saved.open=false;});}
        if(node.classList.contains("collapsed")){
          node.classList.remove("collapsed");const saved=node,toggle=node.querySelector(".section-toggle"),expanded=toggle?.getAttribute("aria-expanded");
          toggle?.setAttribute("aria-expanded","true");undo.push(()=>{saved.classList.add("collapsed");if(toggle && expanded!==null)toggle.setAttribute("aria-expanded",expanded);});
        }
      }
    }
    // A wrapper with display:contents (such as an action group in the slim action bar) has no box of its own, so it is
    // measured as the area its children cover, and scrolled into view through its first child that has a box.
    const hasBox=element=>window.getComputedStyle?.(element).display!=="contents";
    function box(element){
      if(hasBox(element))return element.getBoundingClientRect();
      const rects=[...element.children].map(box).filter(r=>r.width||r.height);
      if(!rects.length)return element.getBoundingClientRect();
      const left=Math.min(...rects.map(r=>r.left)),top=Math.min(...rects.map(r=>r.top)),right=Math.max(...rects.map(r=>r.right)),bottom=Math.max(...rects.map(r=>r.bottom));
      return {left,top,right,bottom,width:right-left,height:bottom-top};
    }
    const scrollTarget=element=>hasBox(element)?element:[...element.children].map(scrollTarget).find(child=>child?.getClientRects().length)||null;
    function position(){
      if(!active || !target)return;
      const rect=box(target),gap=8,margin=16,distance=18;
      const viewportWidth=window.innerWidth,viewportHeight=window.innerHeight;
      const sideSpace=Math.max(rect.left-margin-distance,viewportWidth-margin-distance-rect.right);
      const width=Math.min(sideSpace>=320?Math.min(380,sideSpace):380,viewportWidth-margin*2);
      Object.assign(dialog.style,{width:width+"px",right:"auto",bottom:"auto"});
      const measured=dialog.getBoundingClientRect(),height=measured.bottom-measured.top;
      const clamp=(value,min,max)=>Math.max(min,Math.min(value,Math.max(min,max)));
      let left,topPosition,fallback=false;
      if(rect.right+distance+width<=viewportWidth-margin){
        left=rect.right+distance;topPosition=rect.top;
      }else if(rect.left-distance-width>=margin){
        left=rect.left-distance-width;topPosition=rect.top;
      }else if(rect.bottom+distance+height<=viewportHeight-margin){
        left=rect.left;topPosition=rect.bottom+distance;
      }else if(rect.top-distance-height>=margin){
        left=rect.left;topPosition=rect.top-distance-height;
      }else{
        left=rect.left;topPosition=viewportHeight-height-margin;fallback=true;
      }
      Object.assign(dialog.style,{left:clamp(left,margin,viewportWidth-width-margin)+"px",top:clamp(topPosition,margin,viewportHeight-height-margin)+"px"});
      const dock=dialog.getBoundingClientRect();
      // When the screen cannot fit both, reserve visible content above the card.
      const bottom=Math.min(viewportHeight-gap,rect.bottom+gap,fallback?dock.top-gap:viewportHeight-gap);
      const top=Math.max(gap,Math.min(rect.top-gap,bottom-24));
      Object.assign(spotlight.style,{left:Math.max(gap,rect.left-gap)+"px",top:top+"px",width:Math.max(24,Math.min(window.innerWidth-gap,rect.right+gap)-Math.max(gap,rect.left-gap))+"px",height:Math.max(24,bottom-top)+"px"});
    }
    function render(){
      restoreStep();const step=steps[index];
      target=document.querySelector(step.target);if(step.container && target)target=target.closest(step.container);
      if(!target)target=trigger;
      reveal(target);
      const highlighted=target;highlighted.classList.add("tour-target");undo.push(()=>highlighted.classList.remove("tour-target"));
      if(step.stage){
        const panels=[...document.querySelectorAll("[data-workflow-panel]")],buttons=[...document.querySelectorAll("[data-stage]")];
        const hidden=panels.map(p=>p.hidden),pressed=buttons.map(b=>b.getAttribute("aria-pressed"));
        panels.forEach(p=>p.hidden=p.dataset.workflowPanel!==step.stage);buttons.forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.stage===step.stage)));
        undo.push(()=>{panels.forEach((p,i)=>p.hidden=hidden[i]);buttons.forEach((b,i)=>b.setAttribute("aria-pressed",pressed[i]));});
      }
      $("demoProgress").textContent=`Step ${index+1} of ${steps.length}`;
      $("demoProgress").setAttribute("aria-live","polite");
      $("demoTitle").textContent=step.title;$("demoDescription").textContent=step.what;
      $("demoExampleLabel").textContent="WHY USE IT";$("demoExample").textContent=step.why;
      $("demoBack").disabled=index===0;
      $("demoNext").textContent=offerMore()?`More features (${extra.length}) →`:index===steps.length-1?finishLabel:"Next →";
      $("skipDemo").textContent=offerMore()?"Done":"Skip tour";
      dialog.scrollTop=0;
      (scrollTarget(target)||target).scrollIntoView({block:"start",behavior:"instant"});
      position();requestAnimationFrame(position);
    }
    function open(){
      if(active)return;
      // onStart may prepare the page (for example, open sample data); onFinish receives what it returned.
      context=onStart?.();
      originalScroll=window.scrollY;active=true;index=0;steps=core.length?core:allSteps;
      document.body.classList.add("tour-running");shield.hidden=spotlight.hidden=false;
      dialog.classList.add("guided-tour");dialog.setAttribute("aria-modal","true");dialog.show();render();$("demoNext").focus({preventScroll:true});
    }
    function finish(){
      if(!active)return;
      active=false;restoreStep();shield.hidden=spotlight.hidden=true;dialog.close();dialog.removeAttribute("aria-modal");
      onFinish?.(context);context=undefined;
      document.body.classList.remove("tour-running");window.scrollTo({top:originalScroll,behavior:"instant"});trigger.focus({preventScroll:true});
    }
    trigger.addEventListener("click",open);$("skipDemo").textContent="Skip tour";$("skipDemo").addEventListener("click",finish);
    $("demoBack").addEventListener("click",()=>{if(index>0){index--;render();}});
    $("demoNext").addEventListener("click",()=>{
      if(offerMore()){steps=[...core,...extra];index++;render();}
      else if(index===steps.length-1)finish();else{index++;render();}
    });
    dialog.addEventListener("cancel",event=>{event.preventDefault();finish();});
    document.addEventListener("keydown",event=>{
      if(!active)return;
      if(event.key==="Escape"){event.preventDefault();finish();}
      if(event.key==="Tab"){
        const controls=[$("skipDemo"),$("demoBack"),$("demoNext")].filter(b=>!b.disabled),current=controls.indexOf(document.activeElement);
        event.preventDefault();controls[(current+(event.shiftKey?-1:1)+controls.length)%controls.length].focus({preventScroll:true});
      }
    });
    window.addEventListener("scroll",position,{passive:true});window.addEventListener("resize",position);
    return {open,finish};
  }
  return {create};
})();
