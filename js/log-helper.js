"use strict";
// Shared "Which logs should I collect?" dialog for Case Notes and Escalation Quality.
// The dialog markup lives here, so both pages always show the same helper. A page only needs
// an #openLogHelper button and an #os select, then calls LogHelper.init({context}).
// Any other element with data-log-helper also opens it; data-log-helper-return names the element that gets focus back.
// The helper is still in development, so every opening first shows a warning that must be acknowledged.
window.LogHelper = (() => {
  const markup = `<div class="log-helper-heading"><h2 id="logHelperTitle">Which logs should I collect?</h2><button class="button secondary" id="closeLogHelper" type="button">Close</button></div>
<p class="log-helper-dev-note" id="helperDevNote"><strong>In development.</strong> Double-check all suggestions and verify they are valid before using them.</p>
<p id="helperContext"></p>
<p>Recommendations only — nothing runs automatically. Review permissions, production impact, and approved storage before collection. Logs and dumps can contain sensitive customer data.</p>
<div class="field-grid">
<label class="field">OS/Solution<select id="helperOS"></select></label>
<label class="field">Issue type for this plan<select id="helperSymptom" aria-describedby="helperContext"></select></label>
</div><div id="helperResults"></div>
<div class="log-helper-actions"><button class="button secondary" id="closeLogHelperBottom" type="button">Close</button></div><p id="helperStatus" role="status"></p>`;
  const warningMarkup = `<h2 id="logHelperWarningTitle">This feature is in development</h2>
<p id="logHelperWarningText">The Log Collection Helper is still being developed. Double-check all suggestions and verify their validity before using them, including commands, tools and collection guides.</p>
<div class="log-helper-actions"><button class="button secondary" id="logHelperWarningCancel" type="button">Cancel</button><button class="button primary" id="logHelperWarningOk" type="button">I understand, continue</button></div>`;
  function mountWarning() {
    const warning=document.createElement("dialog");
    warning.id="logHelperWarning";warning.className="log-helper-warning";warning.setAttribute("role","alertdialog");
    warning.setAttribute("aria-labelledby","logHelperWarningTitle");warning.setAttribute("aria-describedby","logHelperWarningText");
    warning.innerHTML=warningMarkup;document.body.append(warning);
    return warning;
  }
  function mount() {
    const dialog=document.createElement("dialog");
    dialog.id="logHelperDialog";dialog.className="log-helper-dialog";dialog.setAttribute("aria-labelledby","logHelperTitle");
    dialog.innerHTML=markup;document.body.append(dialog);
    return dialog;
  }
  function init(api) {
    const $=id=>document.getElementById(id), dialog=mount(), warning=mountWarning();
    let activePlan, platform="";
    function render() {
      activePlan=LogHelperCore.plan({os:$("helperOS").value,platform,symptom:$("helperSymptom").value,reachable:null});
      $("helperResults").replaceChildren(...activePlan.items.map(item=>{
        const section=document.createElement("section"),heading=document.createElement("h3"),how=document.createElement("p");
        heading.textContent=item.title;how.textContent=item.how;section.append(heading,how);
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
      $("helperStatus").textContent="";
    }
    let opener=null, proceeding=false;
    function open(event){
      opener=event?.currentTarget || $("openLogHelper");
      proceeding=false;warning.showModal();$("logHelperWarningOk").focus();
    }
    function showHelper(){
      const context=api.context();
      $("helperOS").replaceChildren(...[...$("os").options].map(item=>{const option=document.createElement("option");option.value=item.value;option.textContent=item.textContent;return option;}));
      $("helperOS").value=context.os || "";platform=context.platform || "";
      $("helperSymptom").replaceChildren(...Object.entries(LogHelperCore.symptoms).map(([value,text])=>{const option=document.createElement("option");option.value=value;option.textContent=text;return option;}));
      $("helperSymptom").value=Object.hasOwn(LogHelperCore.symptoms,context.symptom)?context.symptom:"general";
      $("helperContext").textContent=Object.hasOwn(LogHelperCore.symptoms,context.symptom)
        ? "Based on this case's Issue type: "+LogHelperCore.symptoms[context.symptom]+". Overrides below affect this plan only."
        : "No matching built-in Issue type (custom or unspecified). Showing General Investigation; choose a collection scenario below without changing your case.";
      render();dialog.showModal();
    }
    $("openLogHelper").addEventListener("click",open);
    document.querySelectorAll?.("[data-log-helper]").forEach(button=>button.addEventListener("click",open));
    for(const id of ["helperOS","helperSymptom"]) $(id).addEventListener("change",render);
    $("logHelperWarningOk").addEventListener("click",()=>{proceeding=true;warning.close();showHelper();});
    $("logHelperWarningCancel").addEventListener("click",()=>warning.close());
    // Cancel or Escape on the warning returns focus to whatever opened the helper.
    warning.addEventListener("close",()=>{if(proceeding)return;returnFocus();});
    $("closeLogHelper").addEventListener("click",()=>dialog.close());
    $("closeLogHelperBottom").addEventListener("click",()=>dialog.close());
    function returnFocus(){
      const target=(opener?.dataset?.logHelperReturn && $(opener.dataset.logHelperReturn)) || opener || $("openLogHelper");
      opener=null;target.focus();
    }
    dialog.addEventListener("close",returnFocus);
  }
  return {init,markup,warningMarkup};
})();
