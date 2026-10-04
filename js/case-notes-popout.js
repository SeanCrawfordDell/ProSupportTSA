"use strict";
const CaseNotesPopout = (() => {
  function init(api, env = window) {
    const $ = id => env.document.getElementById(id);
    const url = new env.URL(env.location.href);
    let compact = url.searchParams.get("notesWindow") === "1";
    let child = null, poll = null, missingCase = false;
    const caseId = compact ? url.searchParams.get("case") : null;
    const message = text => { $("notesWindowStatus").textContent = text; };
    function layout() {
      env.document.body.classList.toggle("notes-compact", compact);
      $("compactNotesHeader").hidden = !compact;
      $("popoutNotes").hidden = compact;
      if(compact) {
        $("notesSection").classList?.remove?.("collapsed");
        $("notesToggle").setAttribute?.("aria-expanded", "true");
      }
    }
    function refresh() {
      const note=api.current();
      $("compactCaseTitle").textContent = note ? "Notes · " + (note.request || "Untitled case") : "No case selected";
      $("popoutNotes").disabled = !child && (!note || !api.canEdit());
    }
    $("compactNotesFallback").hidden=true;
    $("popoutNotes").addEventListener("click", () => {
      if(child && !child.closed) { child.focus(); return; }
      if(!api.current() || !api.canEdit()) return;
      const target=new env.URL(env.location.href);
      target.searchParams.set("notesWindow","1");target.searchParams.set("case",api.current().id);target.hash="";
      // Open synchronously from the click so normal popup rules apply.
      try { child=env.open(target.href,"case-notes-compact","popup,width=600,height=720,resizable=yes,scrollbars=yes"); }
      catch { child=null; }
      if(!child) {
        message("The browser blocked the notes window. Allow popups for this site and retry, or use compact view in this tab.");
        $("compactNotesFallback").hidden=false;return;
      }
      if(!api.save()) { child.close();child=null;message("Save failed. Notes remain editable here; retry saving before opening a notes window.");return; }
      api.suspend();
      message("Notes are open in a separate window. This workspace is read-only until that window closes.");
      $("compactNotesFallback").hidden=true;refresh();
      poll=env.setInterval(()=>{
        if(!child?.closed)return;
        env.clearInterval(poll);poll=null;child=null;
        message("");api.resume();refresh();
      },500);
    });
    $("compactNotesFallback").addEventListener("click",()=>{compact=true;layout();$("compactNotesFallback").hidden=true;message("Compact view is in this tab. Use Return to case to restore the full workspace.");});
    $("returnToCase").addEventListener("click",()=>{
      if(!api.save()){message("Save failed. Keep this window open and retry before returning.");return;}
      try {
        if(env.opener && !env.opener.closed && url.searchParams.get("notesWindow")==="1") {
          env.opener.focus();env.close();return;
        }
      } catch { /* The originating window may no longer be available. */ }
      compact=false;layout();message("");
      const full=new env.URL(env.location.href);full.searchParams.delete("notesWindow");full.searchParams.delete("case");
      env.history.replaceState(null,"",full.href);
      if(missingCase) { missingCase=false;api.resume(); }
    });
    layout();refresh();
    return {refresh,get caseId(){return compact ? caseId : null;},unavailable(){missingCase=true;}};
  }
  return {init};
})();
if(typeof module!=="undefined")module.exports=CaseNotesPopout;
else window.CaseNotesPopout=CaseNotesPopout;
