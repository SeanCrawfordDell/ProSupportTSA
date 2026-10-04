"use strict";
window.CaseToolkit = (() => {
  const core=CaseToolkitCore, $=id=>document.getElementById(id);
  let api;
  const readTemplates=()=>window.localStorage ? core.loadTemplates(window.localStorage) : {};
  function refreshTemplates() {
    const select=$("caseIssueType"),id=api?.current()?.toolkit?.issueType || "general";
    try {
      const catalog=core.templateCatalog(readTemplates());
      select.replaceChildren(...Object.entries(catalog).map(([key,item])=>{const option=document.createElement("option");option.value=key;option.textContent=item.name;return option;}));
      if (!catalog[id]) { const option=document.createElement("option");option.value=id;option.textContent="Template unavailable — choose another";select.append(option); }
      select.value=id;
      $("applyTemplate").disabled=!api?.current() || !api.canEdit() || !catalog[id];
      if(!catalog[id])$("templateStatus").textContent="This case's template is unavailable. Choose another template or restore your settings. Existing notes are unchanged.";
    } catch { $("applyTemplate").disabled=true;$("templateStatus").textContent="Template settings could not be read. Restore a valid settings backup before applying templates."; }
  }
  const notify=text=>$("toolkitStatus").textContent=text;
  const bindings={caseIssueType:"issueType",followupOwner:"owner",followupStatus:"status",caseImpact:"impact",caseQuestions:"questions",customerDraft:"customerDraft",summaryDraft:"summaryDraft"};
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
    notify("");$("templateStatus").textContent="";refreshTemplates();
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
    window.addEventListener?.("caseTemplatesChanged",refreshTemplates);
    window.addEventListener?.("supportSettingsRestored",refreshTemplates);
    window.addEventListener?.("storage",event=>{if(event.key===core.templateStorageKey || event.key===null)refreshTemplates();});
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
        if(key==="issueType") { $("templateStatus").textContent=""; refreshTemplates(); }
      });
    });
    $("followupDue").addEventListener("change",()=>{
      if(!api.canEdit())return;
      const value=$("followupDue").value;
      if(value && !Number.isFinite(new Date(value).getTime())){notify("Enter a valid follow-up date and time.");return;}
      api.mutate(note=>{core.ensure(note).due=value ? new Date(value).toISOString() : "";});
    });
    $("applyTemplate").addEventListener("click",()=>{
      if(!api.current() || !api.canEdit())return;
      try {
      const overrides=readTemplates(),id=core.ensure(api.current()).issueType;
      const notesHtml=core.templateHtml(id,overrides),nextHtml=core.templateNextHtml(id,overrides);
      api.mutate(note=>{
        // Markdown parses legacy notes; rich HTML remains intact and is sanitized by the editor.
        note.notes=marked.parse(note.notes,{gfm:true,breaks:true})+notesHtml;
        if(nextHtml)note.next=marked.parse(note.next,{gfm:true,breaks:true})+nextHtml;
      });
      api.refreshEditors();$("templateStatus").textContent="Template appended. Existing notes were kept. Replace the bracketed prompts with case details.";
      } catch(error) { $("templateStatus").textContent=error.message || "Could not apply the template. Existing notes were kept."; }
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
  return {init,refresh,refreshTemplates,canEdit:()=>!!api?.canEdit(),setEditable(value){window.CaseWorkflow?.setEditable(value);$("toolkitFields").disabled=!value;
    $("caseIssueType").disabled=!value || !api?.current();
    $("manageTemplates").disabled=!value;
    refreshTemplates();
    document.querySelectorAll("[data-toolkit]").forEach(button=>{button.disabled=!api?.current();});}};
})();
