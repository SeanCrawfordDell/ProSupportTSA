"use strict";
// Shared "Which logs should I collect?" dialog for Case Notes and Escalation Quality.
// The dialog markup lives here, so both pages always show the same helper. A page only needs
// an #openLogHelper button and an #os select, then calls LogHelper.init({context}).
window.LogHelper = (() => {
  const markup = `<div class="log-helper-heading"><h2 id="logHelperTitle">Which logs should I collect?</h2><button class="button secondary" id="closeLogHelper" type="button">Close</button></div>
<p id="helperContext"></p>
<p>Recommendations only — nothing runs automatically. Review permissions, production impact, and approved storage before collection. Logs and dumps can contain sensitive customer data. Defer host commands if Windows is unavailable.</p>
<div class="field-grid">
<label class="field">OS/Solution<select id="helperOS"></select></label>
<label class="field">Issue type for this plan<select id="helperSymptom" aria-describedby="helperContext"></select></label>
</div><div id="helperResults"></div>
<details id="helperPlain"><summary>Plain text plan</summary><textarea id="helperPlanText" aria-label="Log collection plan" readonly></textarea></details>
<div class="log-helper-actions"><button class="button secondary" id="closeLogHelperBottom" type="button">Close</button></div><p id="helperStatus" role="status"></p>`;
  function mount() {
    const dialog=document.createElement("dialog");
    dialog.id="logHelperDialog";dialog.className="log-helper-dialog";dialog.setAttribute("aria-labelledby","logHelperTitle");
    dialog.innerHTML=markup;document.body.append(dialog);
    return dialog;
  }
  function init(api) {
    const $=id=>document.getElementById(id), dialog=mount();
    let activePlan, platform="";
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
      $("helperStatus").textContent="";
    }
    $("openLogHelper").addEventListener("click",()=>{
      const context=api.context();
      $("helperOS").replaceChildren(...[...$("os").options].map(item=>{const option=document.createElement("option");option.value=item.value;option.textContent=item.textContent;return option;}));
      $("helperOS").value=context.os || "";platform=context.platform || "";
      $("helperSymptom").replaceChildren(...Object.entries(LogHelperCore.symptoms).map(([value,text])=>{const option=document.createElement("option");option.value=value;option.textContent=text;return option;}));
      $("helperSymptom").value=Object.hasOwn(LogHelperCore.symptoms,context.symptom)?context.symptom:"general";
      $("helperContext").textContent=Object.hasOwn(LogHelperCore.symptoms,context.symptom)
        ? "Based on this case's Issue type: "+LogHelperCore.symptoms[context.symptom]+". Overrides below affect this plan only."
        : "No matching built-in Issue type (custom or unspecified). Showing General investigation; choose a collection scenario below without changing your case.";
      render();dialog.showModal();
    });
    for(const id of ["helperOS","helperSymptom"]) $(id).addEventListener("change",render);
    $("closeLogHelper").addEventListener("click",()=>dialog.close());
    $("closeLogHelperBottom").addEventListener("click",()=>dialog.close());
    dialog.addEventListener("close",()=>$("openLogHelper").focus());
  }
  return {init,markup};
})();
