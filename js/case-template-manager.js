"use strict";
(() => {
  const core=CaseToolkitCore,$=id=>document.getElementById(id),dialog=$("templateManager");
  let overrides={},editing="general",baseline="",draftBaseline="";
  const message=text=>$("templateManagerStatus").textContent=text;
  const draft=()=>({name:$("templateName").value,notes:$("templateNotes").value,next:$("templateNext").value});
  const canEdit=()=>window.CaseToolkit.canEdit();
  function discardOK(){return JSON.stringify(draft())===draftBaseline || confirm("Discard unsaved template edits?");}
  function renderList(){
    $("templateList").replaceChildren(...Object.entries(core.templateCatalog(overrides)).map(([id,item])=>{
      const option=document.createElement("option");option.value=id;option.textContent=item.name+(Object.hasOwn(core.templates,id)?" (built-in)":" (personal)");return option;
    }));
  }
  function edit(id){
    editing=id;
    const item=id ? core.templateCatalog(overrides)[id] : {name:"",notes:"",next:""};
    $("templateList").value=id;
    $("templateName").value=item.name;$("templateNotes").value=item.notes;$("templateNext").value=item.next;
    $("deleteTemplate").hidden=!id || Object.hasOwn(core.templates,id);
    $("resetTemplate").hidden=!Object.hasOwn(core.templates,id);
    $("templateEditHeading").textContent=id ? "Edit template" : "New template";
    draftBaseline=JSON.stringify(draft());message("");
  }
  function persist(next){
    if(!canEdit())throw Error("This tab is read-only. Reopen the manager in the editing tab.");
    if(localStorage.getItem(core.templateStorageKey)!==baseline)throw Error("Template settings changed elsewhere. Close and reopen this manager before saving.");
    overrides=core.saveTemplates(localStorage,next);
    baseline=localStorage.getItem(core.templateStorageKey);
    window.dispatchEvent(new Event("caseTemplatesChanged"));
    renderList();
  }
  $("manageTemplates").addEventListener("click",()=>{
    if(!canEdit())return;
    try {
      baseline=localStorage.getItem(core.templateStorageKey);overrides=core.loadTemplates(localStorage);
      renderList();const selected=$("caseIssueType").value;
      edit(core.templateCatalog(overrides)[selected]?selected:"general");dialog.showModal();
    } catch { $("templateStatus").textContent="Template settings could not be opened. Restore a valid settings backup; existing settings were not changed."; }
  });
  $("templateList").addEventListener("change",()=>{
    const id=$("templateList").value;
    if(!discardOK()){$("templateList").value=editing;return;}
    edit(id);
  });
  $("newTemplate").addEventListener("click",()=>{if(discardOK()){edit("");$("templateName").focus();}});
  $("templateEditorForm").addEventListener("submit",event=>{
    event.preventDefault();
    try {
      const id=editing || "custom-"+crypto.randomUUID();
      persist({...overrides,[id]:draft()});edit(id);
      message("Template saved in this browser. It is included in your next backup (Settings → Backup & Restore).");
    } catch(error){message(error.message || "Template could not be saved. Your changes are still in the editor.");}
  });
  $("deleteTemplate").addEventListener("click",()=>{
    if(!editing || Object.hasOwn(core.templates,editing) || !confirm("Delete this personal template? Existing case notes are kept. Unsaved template edits will be discarded."))return;
    try {const next={...overrides};delete next[editing];persist(next);edit("general");message("Personal template deleted. Existing case notes were kept.");}catch(error){message(error.message);}
  });
  $("resetTemplate").addEventListener("click",()=>{
    if(!Object.hasOwn(core.templates,editing) || !confirm("Reset this built-in template's name, notes, and next steps to their defaults? Unsaved edits will be discarded. Case notes are kept."))return;
    try {const next={...overrides};delete next[editing];persist(next);edit(editing);message("Built-in template reset to default.");}catch(error){message(error.message);}
  });
  $("closeTemplateManager").addEventListener("click",()=>{if(discardOK())dialog.close();});
  dialog.addEventListener("cancel",event=>{if(!discardOK())event.preventDefault();});
})();
