"use strict";
window.LogHelper = (() => {
  function init(api) {
    const $=id=>document.getElementById(id), dialog=$("logHelperDialog");
    let activePlan, sourceId, platform="", added=false;
    function render() {
      activePlan=LogHelperCore.plan({os:$("helperOS").value,platform,symptom:$("helperSymptom").value,reachable:null});
      $("helperResults").replaceChildren(...activePlan.items.map(item=>{
        const section=document.createElement("section"),heading=document.createElement("h3"),how=document.createElement("p"),why=document.createElement("p");
        heading.textContent=item.title;how.textContent=item.how;why.textContent="Why: "+item.why;section.append(heading,how,why);
        for(const [key,label] of [["where","Where"],["caution","Precautions"]]){
          if(item[key]){const detail=document.createElement("p");detail.textContent=label+": "+item[key];section.append(detail);}
        }
        if(item.command){
          const label=document.createElement("label"),code=document.createElement("textarea"),copy=document.createElement("button");
          label.className="field";label.textContent="PowerShell commands — review before running";
          code.value=item.command;code.readOnly=true;code.rows=Math.min(6,item.command.split("\n").length+1);code.className="helper-command";label.append(code);
          copy.type="button";copy.className="button secondary";copy.textContent="Copy commands";
          copy.addEventListener("click",async()=>{
            try{await navigator.clipboard.writeText(item.command);$("helperStatus").textContent="Commands copied. Review before running on the indicated system.";}
            catch{code.focus();code.select();$("helperStatus").textContent="Copy failed. Select and copy the commands manually.";}
          });
          section.append(label,copy);
        }
        if(item.url){const link=document.createElement("a");link.href=item.url;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Collection guide ↗";section.append(link);}
        return section;
      }));
      $("helperPlanText").value=LogHelperCore.text(activePlan);
      added=false;$("helperStatus").textContent="";if($("helperAdd"))$("helperAdd").disabled=!api.canAdd?.();
    }
    $("openLogHelper").addEventListener("click",()=>{
      const context=api.context();sourceId=context.id;
      $("helperOS").replaceChildren(...[...$("os").options].map(item=>{const option=document.createElement("option");option.value=item.value;option.textContent=item.textContent;return option;}));
      $("helperOS").value=context.os || "";platform=context.platform || "";
      $("helperSymptom").replaceChildren(...Object.entries(LogHelperCore.symptoms).map(([value,text])=>{const option=document.createElement("option");option.value=value;option.textContent=text;return option;}));
      $("helperSymptom").value=Object.hasOwn(LogHelperCore.symptoms,context.symptom)?context.symptom:"general";
      $("helperContext").textContent=Object.hasOwn(LogHelperCore.symptoms,context.symptom)
        ? "Based on this case's Issue type: "+LogHelperCore.symptoms[context.symptom]+". Overrides below affect this plan only."
        : "No matching built-in Issue type (custom or unspecified). Showing General investigation; choose a collection scenario below without changing your case.";
      if($("helperAdd"))$("helperAdd").textContent=api.addLabel;
      render();dialog.showModal();
    });
    for(const id of ["helperOS","helperSymptom"]) $(id).addEventListener("change",render);
    $("closeLogHelper").addEventListener("click",()=>dialog.close());
    $("closeLogHelperBottom")?.addEventListener("click",()=>dialog.close());
    dialog.addEventListener("close",()=>$("openLogHelper").focus());
    $("helperCopy")?.addEventListener("click",async()=>{
      try{await navigator.clipboard.writeText($("helperPlanText").value);$("helperStatus").textContent="Collection plan copied.";}
      catch{$("helperStatus").textContent="Copy failed. Expand Plain text plan to select and copy it manually.";$("helperPlain").open=true;$("helperPlanText").focus();$("helperPlanText").select();}
    });
    // Pages without an add button (Case Notes) show the plan only.
    $("helperAdd")?.addEventListener("click",()=>{
      if(added)return;
      if(!api.canAdd() || api.context().id!==sourceId){$("helperStatus").textContent="The case changed or is read-only. Reopen the helper for the current case.";return;}
      const saved=api.add($("helperPlanText").value);
      added=true;$("helperAdd").disabled=true;
      $("helperStatus").textContent=saved===false?"Plan added, but saving failed. Keep the page open and check the save status.":"Collection plan added. Collection status has not changed.";
    });
  }
  return {init};
})();
