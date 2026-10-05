"use strict";
window.CaseToolkit = (() => {
  const core=CaseToolkitCore, $=id=>document.getElementById(id);
  let api;
  function refreshIssueTypes() {
    const select=$("caseIssueType"),id=api?.current()?.toolkit?.issueType || "general";
    const osSelect=$("os");

    // If Systems Management is selected, don't override the issue type dropdown
    if(osSelect.value==="Systems Management") {
      return;
    }

    select.replaceChildren(...Object.entries(core.issueTypes).map(([key,item])=>{const option=document.createElement("option");option.value=key;option.textContent=item.name;return option;}));
    // Cases saved with a personal template keep its id until another issue type is chosen.
    if (!Object.hasOwn(core.issueTypes,id)) { const option=document.createElement("option");option.value=id;option.textContent="Custom issue (no longer available)";select.append(option); }
    select.value=id;
  }
  const notify=text=>$("toolkitStatus").textContent=text;
  const bindings={caseIssueType:"issueType",followupOwner:"owner",followupStatus:"status",caseImpact:"impact",caseQuestions:"questions",customerDraft:"customerDraft",summaryDraft:"summaryDraft",productApp:"productApp"};
  function localDate(iso) {
    if(!iso)return "";
    const date=new Date(iso), pad=n=>String(n).padStart(2,"0");
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  function refresh() {
    window.CaseWorkflow?.refresh();
    const note=api?.current();if(!note)return;
    const data=core.ensure(note);
    for(const [id,key] of Object.entries(bindings))$(id).value=data[key];
    $("followupDue").value=localDate(data.due);
    notify("");refreshIssueTypes();
  }
  async function copyDraft(key) {
    const note=api.current();if(!note || !api.canEdit())return;
    const draft=core.ensure(note)[key];
    if(!draft.trim()){notify("Generate or enter a draft first.");return;}
    try{await navigator.clipboard.writeText(draft);notify("Draft copied as plain text. Review it before sharing. Time tracking is unchanged.");}
    catch{notify("Could not copy. Select the draft text and copy it manually.");}
  }
  function init(options) {
    api=options;
    window.CaseWorkflow?.init(options);
    const dialog=$("toolkitDialog");
    document.querySelectorAll("[data-toolkit]").forEach(button=>{
      button.addEventListener("click",()=>{
        if(!api.current())return;
        refresh();
        document.querySelectorAll("#toolkitFields > section").forEach(panel=>{
          panel.hidden=panel.id!==`toolkit-${button.dataset.toolkit}`;
          if(!panel.hidden)$("toolkitTitle").textContent=panel.dataset.title;
        });
        dialog.showModal();
      });
    });
    $("closeToolkit").addEventListener("click",()=>dialog.close());
    dialog.addEventListener("close",()=>api.save());
    Object.entries(bindings).forEach(([id,key])=>{
      $(id).addEventListener("input",()=>{
        if(!api.canEdit())return;
        api.mutate(note=>{core.ensure(note)[key]=$(id).value;},false);
        if(key==="issueType")refreshIssueTypes();
      });
    });
    $("followupDue").addEventListener("change",()=>{
      if(!api.canEdit())return;
      const value=$("followupDue").value;
      if(value && !Number.isFinite(new Date(value).getTime())){notify("Enter a valid follow-up date and time.");return;}
      api.mutate(note=>{core.ensure(note).due=value ? new Date(value).toISOString() : "";});
    });
    for(const [id,key,build] of [["generateCustomer","customerDraft",note=>core.customerUpdate(note,CaseNotes.plainText,$("customerTone").value)],["generateSummary","summaryDraft",note=>core.summary({...note,notes:CaseNotes.exportField(note,"notes"),next:CaseNotes.exportField(note,"next")},CaseNotes.plainText,CaseNotes.duration(CaseNotes.elapsed(note,Date.now())))]] ) {
      $(id).addEventListener("click",()=>{
        const note=api.current();if(!note || !api.canEdit())return;
        if(core.ensure(note)[key] && !confirm("Replace the existing draft with an updated draft from this case?"))return;
        api.mutate(current=>{core.ensure(current)[key]=build(current);});
        $(key).value=core.ensure(note)[key];notify("Draft generated from the current case. Review and edit before sharing; nothing has been sent.");
      });
    }
    $("copyCustomer").addEventListener("click",()=>copyDraft("customerDraft"));
    $("copySummary").addEventListener("click",()=>copyDraft("summaryDraft"));
  }
  return {init,refresh,refreshIssueTypes,canEdit:()=>!!api?.canEdit(),setEditable(value){window.CaseWorkflow?.setEditable(value);$("toolkitFields").disabled=!value;
    $("caseIssueType").disabled=!value || !api?.current();
    refreshIssueTypes();
    document.querySelectorAll("[data-toolkit]").forEach(button=>{button.disabled=!api?.current();});}};
})();
