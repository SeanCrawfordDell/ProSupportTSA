"use strict";
window.CaseWorkflow=(()=>{
  let api,exports;const C=CaseWorkflowCore,$=id=>document.getElementById(id);
  const notify=text=>$("workflowStatus").textContent=text;
  // Grow a field to fit its text. Skipped while hidden (no layout); refit when its stage or the workflow opens.
  function fit(el) {
    if(!el.offsetParent)return;
    el.style.height="auto";el.style.height=el.scrollHeight+el.offsetHeight-el.clientHeight+"px";
  }
  const fitAll=()=>document.querySelectorAll("#workflowFields textarea.auto-grow").forEach(fit);
  function edit(change) {
    if(!api?.canEdit() || !api.current())return;
    api.mutate(note=>change(C.ensure(note),note),false);
    const ok=api.save();notify(ok?"Workflow saved with this case.":"Save failed. Keep this tab open and use Retry save.");
    refreshGaps();return ok;
  }
  function refreshGaps() {
    const note=api?.current();if(!note)return;
    const missing=C.gaps(note);$("workflowGaps").textContent=missing.length?"Still to record: "+missing.join("; ")+".":"Resolution evidence is complete. You can mark this case completed.";
    $("workflowComplete").disabled=!api.canEdit() || !!missing.length;
  }
  function refresh() {
    exports?.invalidate();
    const note=api?.current();if(!note)return;
    const w=note.toolkit.workflow || C.defaults();
    $("workflowFields").disabled=!api.canEdit();
    document.querySelectorAll("[data-workflow-field]").forEach(el=>{const value=w[el.dataset.workflowField];if(el.type==="checkbox")el.checked=value;else el.value=value;});
    fitAll();
    // Retain findings entered in earlier previews, alongside the evidence checklist.
    $("workflowSavedFindings").replaceChildren(...Object.entries(w.results).filter(([,value])=>value.trim()).map(([id,value])=>{
      const label=document.createElement("label"),result=document.createElement("textarea");
      label.className="field";label.append(document.createTextNode("Saved finding · "+(C.tools[id]?.[1] || id)));
      result.value=value;result.maxLength=50000;result.addEventListener("input",()=>edit(data=>{data.results[id]=result.value;}));label.append(result);return label;
    }));
    $("workflowEvidence").replaceChildren(...CaseToolkitCore.checklist(note).map(item=>{
      const row=document.createElement("label"),check=document.createElement("input"),span=document.createElement("span");row.className="workflow-check";check.type="checkbox";check.checked=!!note.toolkit.checks[item.id];span.textContent=item.text;
      check.addEventListener("change",()=>edit((w,n)=>{n.toolkit.checks[item.id]=check.checked;}));row.append(check,span);
      if(item.url){const link=document.createElement("a");link.href=item.url;link.target="_blank";link.rel="noopener noreferrer";link.textContent=" Collection guide ↗";span.append(link);}return row;
    }));refreshGaps();
  }
  function init(options) {
    api=options;
    exports=window.KnowledgeExport?.init({draft:()=>document.querySelector('[data-workflow-field="knowledge"]').value,notify});
    document.querySelectorAll("[data-stage]").forEach(button=>button.addEventListener("click",()=>{
      document.querySelectorAll("[data-stage]").forEach(b=>b.setAttribute("aria-pressed",String(b===button)));
      document.querySelectorAll("[data-workflow-panel]").forEach(p=>p.hidden=p.dataset.workflowPanel!==button.dataset.stage);refresh();
    }));
    document.querySelectorAll("#workflowFields textarea.auto-grow").forEach(el=>el.addEventListener("input",()=>fit(el)));
    $("workflow")?.addEventListener("toggle",fitAll);
    document.querySelectorAll("[data-workflow-field]").forEach(el=>el.addEventListener("input",()=>{if(el.dataset.workflowField==="knowledge")exports?.invalidate();edit(w=>{w[el.dataset.workflowField]=el.type==="checkbox"?el.checked:el.value;});}));
    $("workflowFollowup").addEventListener("click",()=>document.querySelector('[data-toolkit="followup"]').click());
    $("workflowComplete").addEventListener("click",()=>{if(C.gaps(api.current()).length)return;if(edit((w,n)=>{n.toolkit.status="Completed";})){refresh();notify("Case marked completed in this browser. Use Copy to Lightning to transfer the case record.");}});
    $("workflowGenerate").addEventListener("click",()=>{
      if(!api.canEdit())return;
      if(api.current().toolkit.workflow?.knowledge && !confirm("Replace the existing knowledge draft with current case details?"))return;
      edit((w,n)=>{w.knowledge=C.knowledge(n,CaseNotes.plainText);});refresh();
    });
    $("workflowCopy").addEventListener("click",async()=>{
      exports?.invalidate();
      const text=api.current()?.toolkit.workflow?.knowledge;if(!text?.trim()){notify("Build or enter a knowledge draft first.");return;}
      try{await navigator.clipboard.writeText(text);notify("Knowledge draft copied. Review customer details before sharing.");}catch{notify("Could not copy. Select and copy the draft manually.");}
    });
    for(const id of ["os","platform","issue","request","caseIssueType"])$(id).addEventListener("change",refresh);
  }
  return {init,refresh,setEditable(value){if($("workflowFields"))$("workflowFields").disabled=!value;}};
})();
