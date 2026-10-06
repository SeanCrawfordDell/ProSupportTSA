"use strict";
(() => {
  const key = "dell-support.case-notes.v1";
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value).replace(/[&<>"']/g,char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  let state = CaseNotes.empty(), dirty = false, writable = false, copying = false, release, assist = null, caseList = null;
  let savedState = null;
  let summaryCaseId = null;
  let notesPopout, devinIntegration;
  // Keep the case actions available at the top of the workspace while scrolling.
  const actionDock = document.getElementById("copyActions");
  const caseWorkArea = $("caseWorkArea");
  if (caseWorkArea?.prepend && actionDock) caseWorkArea.prepend(actionDock);
  const buttonTooltips = {
    newNote: "Start a new case with its first dated note and begin time tracking.",
    loadExampleNote: "Load a sample case note you can safely explore.",
    openTraining: "Tutorial Demo and Load Example.",
    openSettingsMenu: "Settings: customize case fields, back up and restore.",
    openBackupRestore: "Back up, restore, or delete your case history and settings.",
    openToolsMenu: "Tools hub and support tool catalogs.",
    tutorialDemo: "See a guided tour of Case Notes and the toolbox.",
    customizeFields: "Choose which case fields appear, their order, and site effects such as the Copy to Lightning shake.",
    toggleHistory: "Show or hide the list of saved case notes.",
    chooseSyncFolder: "Choose the folder where backups are saved. A OneDrive-synced folder is ideal.",
    backupNow: "Save a backup of your case history and settings right now.",
    openRestore: "Go back to an earlier backup of your case history or settings.",
    stopTimer: "Stop time tracking for the current case.",
    emailNote: "Download the case notes as an email draft with screenshots.",
    escalateNote: "Open a pre-filled escalation request using these case details.",
    copyNote: "Copy the case details with the selected day's notes to paste into Lightning, and stop the timer. Use Copy case summary in Case Summary to copy every day.",
    manageAiTasks: "Add or manage your own AI prompts and skills.",
    copyDevin: "Copy the selected AI prompt with the current case context.",
    toggleActionDock: "Keep the action dock in place instead of floating while you scroll.",
    openLogHelper: "Get a collection plan based on the selected OS and issue.",
    railLogHelper: "Get a collection plan based on the selected OS and issue.",
    toolboxLauncher: "Open the draggable quick-action toolbox."
  };
  const toolkitTooltips = {
    followup: "Track a follow-up owner, due date, and status.",
    customer: "Draft a customer-ready update from the case details.",
    summary: "Build a concise handoff summary for the next owner."
  };
  function addButtonTooltips() {
    document.querySelectorAll?.("button").forEach(button => {
      if (button.title) return;
      const tooltip = buttonTooltips[button.id] || toolkitTooltips[button.dataset?.toolkit] || button.getAttribute?.("aria-label");
      if (tooltip) button.title = tooltip;
    });
  }
  addButtonTooltips();
  const { askChoice } = window.CaseDialogs;
  // A restore or field change hands back a new, already stored case history; it becomes the saved state.
  function replaceState(next) { state = next; savedState = JSON.parse(JSON.stringify(next)); dirty = false; }
  // Backup & Restore lives in case-backup-ui.js; it reads and replaces the case history through these functions.
  const { scheduleBackup, safetyBefore } = window.CaseBackupUI.init({
    key,
    state: () => state,
    replaceState,
    writable: () => writable,
    copying: () => copying,
    render: () => render(),
    report: (message, dialogStatus) => report(message, dialogStatus)
  });
  const actionDockPreferenceKey = "dell-support.case-notes.action-dock-floating";
  const actionDockToggle = $("toggleActionDock");
  let actionDockFloating = true;
  try { actionDockFloating = localStorage.getItem(actionDockPreferenceKey) !== "false"; } catch { /* Keep floating as the default. */ }
  const rightRailQuery = window.matchMedia?.("(min-width: 1500px) and (min-height: 780px)");
  const actionRailWidthKey = "dell-support.case-notes.action-rail-width";
  const actionRailResizer = $("actionRailResizer");
  const actionRailMinimumWidth = 180, actionRailMaximumWidth = 480;
  let actionRailWidth = 270;
  try { actionRailWidth = Number.parseInt(localStorage.getItem(actionRailWidthKey), 10) || actionRailWidth; } catch {}
  const clampActionRailWidth = width => Math.min(actionRailMaximumWidth, Math.max(actionRailMinimumWidth, width));
  function setActionRailWidth(width, persist = false) {
    actionRailWidth = clampActionRailWidth(width);
    caseWorkArea?.style?.setProperty("--action-rail-width", `${actionRailWidth}px`);
    actionRailResizer?.setAttribute("aria-valuenow", String(actionRailWidth));
    if (!persist) return;
    try { localStorage.setItem(actionRailWidthKey, String(actionRailWidth)); } catch {}
  }
  setActionRailWidth(actionRailWidth);
  function resizeActionRail(event) {
    const edge = actionDock?.getBoundingClientRect?.().right;
    if (typeof edge === "number") setActionRailWidth(edge - event.clientX, true);
  }
  actionRailResizer?.addEventListener("pointerdown", event => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    const pointerId = event.pointerId;
    actionRailResizer.setPointerCapture?.(pointerId);
    const onMove = move => { if (move.pointerId === pointerId) resizeActionRail(move); };
    const onEnd = end => {
      if (end.pointerId !== pointerId) return;
      actionRailResizer.releasePointerCapture?.(pointerId);
      window.removeEventListener?.("pointermove", onMove);
      window.removeEventListener?.("pointerup", onEnd);
      window.removeEventListener?.("pointercancel", onEnd);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  });
  actionRailResizer?.addEventListener("keydown", event => {
    const widths = { ArrowLeft:actionRailWidth + 20, ArrowRight:actionRailWidth - 20, Home:actionRailMinimumWidth, End:actionRailMaximumWidth };
    if (!(event.key in widths)) return;
    event.preventDefault();
    setActionRailWidth(widths[event.key], true);
  });
  function updateActionDockMode() {
    if (!actionDock) return;
    actionDock.classList.toggle("floating-disabled", !actionDockFloating);
    actionDock.classList.toggle("right-rail", actionDockFloating && Boolean(rightRailQuery?.matches));
    caseWorkArea?.classList.toggle("action-rail", actionDockFloating && Boolean(rightRailQuery?.matches));
    // The wide side rail always shows the AI tools; the slim bar shows them only when opened.
    if ($("aiToolsPanel")) $("aiToolsPanel").hidden = !(aiToolsOpen || actionDock.classList.contains("right-rail"));
    if (actionDockToggle) {
      actionDockToggle.textContent = actionDockFloating ? "Stop floating" : "Enable floating";
      actionDockToggle.setAttribute("aria-pressed", String(!actionDockFloating));
    }
  }
  actionDockToggle?.addEventListener("click", () => {
    actionDockFloating = !actionDockFloating;
    try { localStorage.setItem(actionDockPreferenceKey, String(actionDockFloating)); } catch { /* This visit still honors the choice. */ }
    updateActionDockMode();
  });
  // Below the side-rail size the action bar stays one slim row; the AI tools open from "AI tools" on demand.
  const aiToolsKey = "dell-support.ai-tools-open";
  let aiToolsOpen = false;
  try { aiToolsOpen = localStorage.getItem(aiToolsKey) === "true"; } catch { /* Closed by default. */ }
  function setAiTools(open) {
    aiToolsOpen = open;
    $("aiToolsPanel").hidden = !open && !actionDock?.classList.contains("right-rail");
    $("toggleAiTools").setAttribute("aria-expanded", String(open));
  }
  setAiTools(aiToolsOpen);
  $("toggleAiTools").addEventListener("click", () => {
    setAiTools(!aiToolsOpen);
    try { localStorage.setItem(aiToolsKey, String(aiToolsOpen)); } catch { /* Still works for this visit. */ }
    if (aiToolsOpen) $("devinTask").focus();
  });
  rightRailQuery?.addEventListener?.("change", updateActionDockMode);
  updateActionDockMode();
  let loadFailed = false;
  const sidebarKey = "dell-support.case-history-collapsed";
  function setHistoryCollapsed(collapsed) {
    $("caseHistory").hidden = collapsed;
    $("notesLayout").classList.toggle("history-collapsed", collapsed);
    caseWorkArea?.classList.toggle("history-collapsed", collapsed);
    actionDock?.classList.toggle("workspace-width", !collapsed);
    $("toggleHistory").setAttribute("aria-expanded", String(!collapsed));
    $("toggleHistory").textContent = collapsed ? "Show Recent Cases" : "Hide Recent Cases";
  }
  let historyCollapsed = false;
  try { historyCollapsed = localStorage.getItem(sidebarKey) === "true"; } catch { /* Use expanded default. */ }
  setHistoryCollapsed(historyCollapsed);
  $("toggleHistory").addEventListener("click", () => {
    historyCollapsed = !historyCollapsed;
    setHistoryCollapsed(historyCollapsed);
    try { localStorage.setItem(sidebarKey, String(historyCollapsed)); } catch { /* Still works for this visit. */ }
  });
  // The Recent cases list (view, search, filters, cards) lives in case-history-list.js.
  caseList = window.CaseHistoryList.init({
    state: () => state, writable: () => writable, copying: () => copying, save: () => save(),
    select: id => selectCase(id),
    commitCaseChange: (change, failure) => commitCaseChange(change, failure), showStoredCase: (note, collection) => showStoredCase(note, collection),
    status: text => status(text), report: message => report(message), scheduleBackup: () => scheduleBackup(), refreshAssist: () => assist?.refresh()
  });
  function history() { caseList?.render(); }
  // Opens a case from Recent cases (or a notification), saving the current one first.
  function selectCase(id) {
    if (copying || (writable && !save())) return;
    state.selected = id;
    if (writable) { dirty = true; save(); }
    render();
  }
  // Collapsible form sections (Case Details, Notes, Action Plan / Next Steps).
  const sectionsKey = "dell-support.case-notes-sections";
  const sectionIds = ["caseDetails", "notes", "actionPlan"];
  let sectionState = {};
  try { sectionState = JSON.parse(localStorage.getItem(sectionsKey)) || {}; } catch { sectionState = {}; }
  function setSectionCollapsed(id, collapsed) {
    const section = $(id + "Section"), toggle = $(id + "Toggle");
    if (!section || !toggle) return;
    section.classList.toggle("collapsed", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
  }
  sectionIds.forEach(id => {
    setSectionCollapsed(id, !!sectionState[id]);
    $(id + "Toggle")?.addEventListener("click", () => {
      const collapsed = !$(id + "Section").classList.contains("collapsed");
      setSectionCollapsed(id, collapsed);
      sectionState[id] = collapsed;
      try { localStorage.setItem(sectionsKey, JSON.stringify(sectionState)); } catch { /* Still works for this visit. */ }
    });
  });
  const selected = () => state.cases.find(note => note.id === state.selected);
  const summaryOpen = () => !!selected() && summaryCaseId === selected().id;
  const canEditEntry = () => writable && !copying && !summaryOpen();
  function renderEntryNavigation() {
    const note = selected(), tabs = $("caseEntryTabs");
    if (!tabs) return;
    tabs.replaceChildren();
    $("newCaseEntry").disabled = !note || !writable || copying;
    if (!note) { summaryCaseId = null; return; }
    const summary = summaryOpen(), entries = CaseNotes.entryList(note);
    const buttons = [];
    let activeButton = null;
    function tab(label, active, id, action) {
      const button = document.createElement("button"); button.type="button";
      button.className="case-entry-tab"; button.textContent=label; button.id=id;
      button.setAttribute("role","tab"); button.setAttribute("aria-selected",String(active));
      button.setAttribute("aria-controls",id === "caseSummaryTab" ? "caseSummaryPanel" : "notesSectionBody actionPlanSection");
      button.tabIndex=active ? 0 : -1; button.disabled=copying;
      button.addEventListener("click",action);
      button.addEventListener("keydown",event=>{
        const index=buttons.indexOf(button); let next;
        if(event.key==="ArrowRight")next=(index+1)%buttons.length;
        else if(event.key==="ArrowLeft")next=(index+buttons.length-1)%buttons.length;
        else if(event.key==="Home")next=0;
        else if(event.key==="End")next=buttons.length-1;
        else return;
        event.preventDefault(); buttons[next].focus(); buttons[next].click();
      });
      if(active) activeButton=button;
      buttons.push(button); tabs.append(button); return button;
    }
    tab("Case Summary",summary,"caseSummaryTab",()=>{
      if (!save()) return;
      summaryCaseId=note.id; render(); $("caseSummaryTab")?.focus();
    });
    entries.forEach((entry,index)=>{
      const date=new Date(entry.created), sameDay=entries.filter(item=>new Date(item.created).toDateString()===date.toDateString()).length>1;
      const label=date.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})+(sameDay ? " · "+date.toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"})+" · "+(index+1) : "");
      const id="case-entry-tab-"+entry.id;
      const button=tab(label,!summary && entry.id===note.activeEntryId,id,()=>{
        if (copying || !save()) return;
        if (!writable) {
          CaseNotes.selectEntry(note,entry.id); summaryCaseId=null; render(); $(id)?.focus(); return;
        }
        const previousSummary=summaryCaseId; summaryCaseId=null;
        if(!commitCaseChange(candidate=>CaseNotes.selectEntry(candidate.cases.find(item=>item.id===note.id),entry.id)))summaryCaseId=previousSummary;
        $(id)?.focus();
      });
      button.title="Created "+date.toLocaleString()+"; last edited "+new Date(entry.updated).toLocaleString();
    });
    $("notesSectionBody").hidden=summary; $("actionPlanSection").hidden=summary;
    $("caseSummaryPanel").hidden=!summary;
    if(summary) renderCaseSummary(note,entries);
    else {
      const active=entries.find(entry=>entry.id===note.activeEntryId);
      $("entryCreatedInfo").textContent="Created "+new Date(active.created).toLocaleString()+" · Last edited "+new Date(active.updated).toLocaleString();
      $("notesSectionBody").setAttribute("aria-labelledby","case-entry-tab-"+active.id);
    }
    revealEntryTab(tabs,activeButton);
  }
  // Scroll the tab strip sideways to show the selected tab. scrollIntoView would also scroll the page down to the tabs.
  function revealEntryTab(tabs,button) {
    const strip=tabs.getBoundingClientRect?.(), rect=button?.getBoundingClientRect?.();
    if(!strip || !rect) return;
    if(rect.left<strip.left) tabs.scrollLeft-=strip.left-rect.left;
    else if(rect.right>strip.right) tabs.scrollLeft+=rect.right-strip.right;
  }
  function renderCaseSummary(note,entries) {
    const panel=$("caseSummaryPanel"); panel.replaceChildren();
    const heading=document.createElement("div"); heading.className="case-summary-heading";
    const title=document.createElement("h3"); title.textContent="Case Summary";
    const copyAll=document.createElement("button"); copyAll.type="button"; copyAll.className="button primary"; copyAll.id="copyCaseSummary";
    copyAll.textContent="Copy case summary"; copyAll.title="Copy every case field and every dated note as plain text. The timer is not changed.";
    copyAll.disabled=copying;
    const copyStatus=document.createElement("p"); copyStatus.id="caseSummaryCopyStatus"; copyStatus.setAttribute("role","status");
    copyAll.addEventListener("click",async()=>{
      const current=selected(); if(!current || copying) return;
      try { await navigator.clipboard.writeText(CaseNotes.copyText(current, Date.now(), state.fieldConfig)); copyStatus.textContent="Copied the whole case: every field and all "+entries.length+" dated note"+(entries.length===1 ? "" : "s")+". The timer is unchanged."; }
      catch { copyStatus.textContent="Could not copy. Allow clipboard access and try again."; }
    });
    heading.append(title,copyAll); panel.append(heading,copyStatus);
    const context=document.createElement("dl"); context.className="case-summary-details";
    CaseNotes.getEffectiveFields(state).filter(field=>!["notes","next"].includes(field.id) && note[field.id]).forEach(field=>{
      const label=document.createElement("dt"), value=document.createElement("dd");
      label.textContent=field.label; value.textContent=note[field.id]; context.append(label,value);
    });
    panel.append(context);
    const overview=document.createElement("p"); overview.className="case-summary-overview";
    overview.textContent=entries.length+" note"+(entries.length===1 ? "" : "s")+" · Oldest to newest · Total time: "+CaseNotes.duration(CaseNotes.elapsed(note,Date.now())); panel.append(overview);
    entries.forEach((entry,index)=>{
      const section=document.createElement("details"); section.className="case-summary-entry"; section.open=true;
      const heading=document.createElement("summary"); heading.textContent=new Date(entry.created).toLocaleString()+" · Note "+(index+1); section.append(heading);
      for(const [field,label] of [["notes","Notes"],["next","Action Plan / Next Steps"]]) {
        const h=document.createElement("h4"),content=document.createElement("div"); h.textContent=label; content.className="case-summary-content";
        if(entry[field] && window.CaseMarkdown?.renderContent)content.append(window.CaseMarkdown.renderContent(entry[field],note));
        else content.textContent=CaseNotes.plainText(entry[field]) || "No content recorded.";
        section.append(h,content);
      }
      panel.append(section);
    });
  }
  $("newCaseEntry")?.addEventListener("click",()=>{
    const note=selected(); if(!note || !writable || copying || !save())return;
    const previousSummary=summaryCaseId; summaryCaseId=null;
    if(commitCaseChange(candidate=>CaseNotes.addEntry(candidate.cases.find(item=>item.id===note.id),crypto.randomUUID(),Date.now()))) {
      setSectionCollapsed("notes",false); setSectionCollapsed("actionPlan",false); $("notesRich").focus();
    } else summaryCaseId=previousSummary;
  });
  function status(text, error = false, warning = false) {
    $("saveStatus").textContent = text;
    $("saveStatus").classList.toggle("error", error || warning);
    $("retrySave").hidden = !error || !writable;
  }
  // Results of actions started from a dialog that has since closed (restore, delete, settings) are shown on the page.
  // The dialog's own status line keeps the same text for when it is reopened.
  function report(message, dialogStatus = "backupStatus") {
    if ($(dialogStatus)) $(dialogStatus).textContent = message;
    const page = $("pageStatus");
    if (!page) return;
    page.textContent = message; page.hidden = false;
    const active = document.activeElement;
    if (!active || active === document.body || active.closest?.("dialog:not([open])")) page.focus?.();
  }
  // Browsers allow roughly five million characters per site; warn well before saves start failing.
  const storageWarningChars = 4000000;
  const imageIds = data => new Set(["cases","archive","trash"].flatMap(collection => (data?.[collection] || []).flatMap(note => Object.keys(note.images || {}))));
  function save() {
    if (!writable || !dirty) return !dirty;
    try {
      state.cases.forEach(note=>CaseNotes.syncEntry(note));
      const previousVersions = JSON.stringify(state.revisions || {});
      CaseNotes.checkpoint(state,savedState,Date.now());
      // Screenshots added since the last save may still be waiting for their reference to be inserted.
      const saved = imageIds(savedState);
      CaseNotes.pruneImages(state, new Set([...imageIds(state)].filter(id => !saved.has(id))));
      const text = JSON.stringify(state);
      try { localStorage.setItem(key, text); }
      catch (error) { state.revisions = JSON.parse(previousVersions); throw error; }
      savedState = JSON.parse(text);
      dirty = false;
      if (text.length > storageWarningChars) status(`Saved · Browser storage is ${Math.round(text.length / 50000)}% full. Delete cases from Trash or remove screenshots you no longer need.`, false, true);
      else status("Saved · " + new Date().toLocaleTimeString());
      scheduleBackup();
      return true;
    } catch {
      status("Save failed. Changes remain in this tab. Free browser storage and retry before leaving.", true);
      return false;
    }
  }
  function load() {
    try { state = CaseNotes.parse(localStorage.getItem(key)); savedState = JSON.parse(JSON.stringify(state)); loadFailed = false; }
    catch {
      loadFailed = true;
      $("lockNotice").hidden = false;
      $("lockNotice").textContent = "Case history could not be read. Editing is disabled to protect stored notes. Reload to try again.";
    }
  }

  function commitCaseChange(change, failure = "Could not save this change. Your saved notes were kept. Free browser storage or export a backup and retry.") {
    if (!writable || copying || !save()) return false;
    try {
      let candidate = JSON.parse(JSON.stringify(state)); change(candidate);
      candidate = CaseNotes.parse(JSON.stringify(candidate));
      localStorage.setItem(key,JSON.stringify(candidate));
      state = candidate; savedState = JSON.parse(JSON.stringify(state)); render(); return true;
    } catch { report(failure); return false; }
  }
  function showStoredCase(note,collection) {
    $("caseRecoveryTitle").textContent = collection === "trash" ? "Case in Trash" : "Archived Case";
    $("caseVersionList").replaceChildren();
    $("caseVersionPreview").textContent = CaseNotes.copyText(note,Date.now(),state.fieldConfig);
    $("caseRecoveryStatus").textContent = "Use Restore in the case list to return this case to your workspace.";
    $("caseRecovery").showModal();
  }
  function controls() {
    ["caseVersions","printCase"].forEach(id => { if ($(id)) $(id).disabled = !selected() || copying; });
    $("fields").disabled = !writable || copying;
    $("newNote").disabled = $("startNote").disabled = $("loadExampleNote").disabled = $("customizeFields").disabled = !writable || copying;
    $("emailNote").disabled = $("copyNote").disabled = $("escalateNote").disabled = $("copyDevin").disabled = !writable || copying;
    $("devinTask").disabled = !writable || copying;
    $("stopTimer").disabled = !writable || copying || !selected() || selected().started === null;
    window.CaseMarkdown?.setEditable(canEditEntry());
    window.CaseToolkit?.setEditable(canEditEntry());
    // The rail shortcut follows the Evidence-panel button, which is disabled together with the workflow fields.
    if ($("railLogHelper")) $("railLogHelper").disabled = $("openLogHelper").matches?.(":disabled") ?? true;
    if($("newCaseEntry"))$("newCaseEntry").disabled=!selected() || !writable || copying;
    $("caseEntryTabs")?.querySelectorAll("button").forEach(button=>{button.disabled=copying;});
    notesPopout?.refresh();
    devinIntegration?.refresh();
    window.CaseFieldLayout?.refresh();
  }
  function tick() {
    const note = selected(); if (!note) return;
    const now = Date.now();
    $("elapsed").textContent = CaseNotes.duration(CaseNotes.lastSession(note, now));
    $("totalElapsed").textContent = CaseNotes.duration(CaseNotes.elapsed(note, now));
    $("timerState").textContent = note.started === null ? "Timer stopped" : "Tracking time";
    $("stopTimer").disabled = !writable || copying || note.started === null;
  }
  function render() {
    window.CaseFieldLayout?.discard();
    const note = selected();
    $("welcome").hidden = !!note; $("noteEditor").hidden = !note;
    if (note) {
      const effectiveFields = CaseNotes.getEffectiveFields(state);
      const fieldGrid = $("fields").querySelector(".field-grid");
      
      // Create a map of field IDs to their container elements for reordable fields
      const fieldContainers = new Map();
      const otherElements = []; // Elements that shouldn't be reordered (rich text fields, etc.)
      
      Array.from(fieldGrid.children).forEach(child => {
        if (child.dataset?.customField && !Object.hasOwn(state.fieldConfig.customFields,child.dataset.customField)) return;
        const input = child.querySelector('[id]');
        if (input && effectiveFields.some(f => f.id === input.id)) {
          fieldContainers.set(input.id, child);
        } else {
          otherElements.push(child);
        }
      });
      
      // Create custom field containers if they don't exist
      effectiveFields.forEach(({ id, label }) => {
        if (!fieldContainers.has(id) && state.fieldConfig.customFields[id]) {
          const fieldContainer = document.createElement("label");
          fieldContainer.className = "field";
          fieldContainer.innerHTML = `${escapeHtml(label)}<input id="${escapeHtml(id)}" type="text" placeholder="${escapeHtml(label)}" autocomplete="off">`;
          fieldContainer.dataset.customField = id;
          fieldContainers.set(id, fieldContainer);
        }
      });
      
      // Clear the grid and rebuild it in the correct order
      fieldGrid.innerHTML = '';
      
      // Add fields in the configured order
      effectiveFields.forEach(({ id }) => {
        const fieldContainer = fieldContainers.get(id);
        if (fieldContainer) {
          fieldGrid.appendChild(fieldContainer);
        }
      });
      
      // Add back the other elements (rich text fields, etc.) at the end
      otherElements.forEach(element => {
        fieldGrid.appendChild(element);
      });
      // Hidden fields stay in the grid with their values; they are only taken out of view.
      const visible = new Set(CaseNotes.visibleFieldIds(state, readHidden()));
      fieldContainers.forEach((container, id) => { container.hidden = !visible.has(id); });
      const hiddenLabels = effectiveFields.filter(field => fieldContainers.has(field.id) && !visible.has(field.id)).map(field => field.label);
      if ($("hiddenFieldsNote")) {
        $("hiddenFieldsNote").hidden = !hiddenLabels.length;
        $("hiddenFieldsText").textContent = hiddenLabels.length ? `Hidden in Case Details: ${hiddenLabels.join(", ")}.` : "";
      }
      
      // Now populate values
      effectiveFields.forEach(({ id }) => {
        const fieldElement = $(id);
        if (fieldElement) {
          // Preserve free-text values saved before these dropdowns were introduced.
          if (id === "country" || id === "os") {
            fieldElement.querySelectorAll("[data-legacy-option]").forEach(option => option.remove());
            const match = Array.from(fieldElement.options).find(option =>
              option.value === note[id] || option.textContent.toLowerCase() === note[id].toLowerCase());
            if (!match && note[id]) {
              const option = document.createElement("option");
              option.value = note[id]; option.textContent = note[id];
              option.setAttribute("data-legacy-option", ""); fieldElement.append(option);
            }
            fieldElement.value = match ? match.value : note[id];
          } else if (fieldElement.value !== undefined) {
            fieldElement.value = note[id];
          }
        }
      });
    }
    renderEntryNavigation(); controls(); history(); tick();
    window.CaseMarkdown?.refresh();
    window.CaseToolkit?.refresh();
    window.CaseRubric?.refresh();
  }
  function newNote() {
    if (!writable || copying || !save()) return;
    summaryCaseId=null;
    CaseNotes.create(state, crypto.randomUUID(), Date.now()); dirty = true; save(); render();
    $("copyStatus").textContent = "";
    $("tag").focus();
  }
  $("closeCaseRecovery")?.addEventListener("click", () => $("caseRecovery").close());
  $("caseVersions")?.addEventListener("click", () => {
    if (!selected() || (writable && !save())) return;
    const id = selected().id;
    $("caseRecoveryTitle").textContent = "Version History";
    $("caseVersionPreview").textContent = "Choose Preview to inspect a version before restoring.";
    $("caseRecoveryStatus").textContent = "";
    const versions = Object.hasOwn(state.revisions || {},id) ? state.revisions[id] : [];
    $("caseVersionList").replaceChildren(...versions.map(version => {
      const row = document.createElement("div"); row.className = "case-utilities";
      const label = document.createElement("span"); label.textContent = new Date(version.savedAt).toLocaleString(); row.append(label);
      const preview = document.createElement("button"); preview.type = "button"; preview.className = "button secondary"; preview.textContent = "Preview";
      preview.addEventListener("click", () => { $("caseVersionPreview").textContent = CaseNotes.copyText(version.note,Date.now(),state.fieldConfig); }); row.append(preview);
      const restore = document.createElement("button"); restore.type = "button"; restore.className = "button secondary"; restore.textContent = "Restore version"; restore.disabled = !writable;
      restore.addEventListener("click", () => {
        if (!confirm("Restore this saved version? The current version will remain available in Version History.")) return;
        const ok = commitCaseChange(candidate => {
          const current = candidate.cases.find(note => note.id === id); if (!current) throw Error("Case changed");
          const snapshot = CaseNotes.versionSnapshot(current,Date.now());
          candidate.revisions[id] = [{savedAt:Date.now(),note:snapshot},...(Object.hasOwn(candidate.revisions,id) ? candidate.revisions[id] : [])].slice(0,10);
          // Versions reference the case's screenshots rather than carrying copies.
          const restored = JSON.parse(JSON.stringify(version.note)); restored.started = null; restored.updated = Date.now(); restored.pinned = current.pinned; restored.images = {...current.images};
          candidate.cases[candidate.cases.findIndex(note => note.id === id)] = restored;
        });
        if (ok) $("caseRecovery").close(); else $("caseRecoveryStatus").textContent = "Could not save the restored version. Current notes were kept.";
      }); row.append(restore); return row;
    }));
    if (!versions.length) $("caseRecoveryStatus").textContent = "No earlier versions yet. Versions are captured when changed notes are saved.";
    $("caseRecovery").showModal();
  });
  $("printCase")?.addEventListener("click", async () => {
    const note = selected(); if (!note || (writable && !save())) return;
    const printArea = $("casePrint");
    printArea.replaceChildren(window.CaseMarkdown.sanitize(window.CaseMarkdown.emailHtml(note,Date.now(),state.fieldConfig,true).html));
    printArea.hidden = false; document.body.classList.add("printing-case");
    await Promise.all([...printArea.querySelectorAll("img")].map(img => img.decode?.().catch(() => {})));
    window.print();
    document.body.classList.remove("printing-case"); printArea.hidden = true;
  });
  $("stopTimer").addEventListener("click", () => {
    const note = selected();
    if (!note || !writable || copying || note.started === null) return;
    const now = Date.now();
    CaseNotes.stop(note, now); note.updated = now; dirty = true;
    save(); tick();
  });
  $("newNote").addEventListener("click", newNote);
  $("startNote").addEventListener("click", newNote);
  
  // A small mock FLEP screenshot for the sample case. Returns null where canvas is unavailable.
  function exampleScreenshot() {
    try {
      const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 200;
      const g = canvas.getContext?.("2d"); if (!g) return null;
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, 640, 200);
      g.fillStyle = "#0b3b5c"; g.fillRect(0, 0, 640, 30);
      g.fillStyle = "#ffffff"; g.font = "bold 13px Segoe UI, Arial, sans-serif"; g.fillText("FLEP · System log · HV-NODE-02 · Event ID 27", 12, 20);
      g.fillStyle = "#e8eef3"; g.fillRect(0, 30, 640, 24);
      g.fillStyle = "#1d2b36"; g.font = "bold 12px Segoe UI, Arial, sans-serif";
      [["Time", 12], ["Source", 110], ["Event ID", 210], ["Message", 290]].forEach(([text, x]) => g.fillText(text, x, 47));
      g.font = "12px Segoe UI, Arial, sans-serif";
      ["08:17:05", "09:42:13", "11:58:40", "14:21:09", "16:03:52"].forEach((time, row) => {
        const y = 54 + row * 28;
        if (row % 2) { g.fillStyle = "#f6f8fa"; g.fillRect(0, y, 640, 28); }
        g.fillStyle = "#1d2b36";
        [[time, 12], ["b57nd60a", 110], ["27", 210], ["Network link is disconnected (NIC port 2)", 290]].forEach(([text, x]) => g.fillText(text, x, y + 18));
      });
      const data = canvas.toDataURL("image/png");
      return /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data) ? { name: "flep-event-27.png", data } : null;
    } catch { return null; }
  }
  const exampleExists = () => ["cases","archive","trash"].some(collection => (state[collection] || []).some(note => CaseExample.isSample(note.id)));
  // Adds the sample cases, or resets them when they already exist, and opens the main one. Other cases, and any
  // running timer, are unchanged.
  function loadExampleNote({ confirmReset = true } = {}) {
    if (!writable || copying || !save()) return false;
    if (confirmReset && exampleExists() && !confirm("Reset the sample cases? Any changes you made to them will be replaced.")) return false;
    // Never archive a real case to make room for the samples.
    const own = state.cases.filter(note => !CaseExample.isSample(note.id)).length, needed = CaseExample.IDS.length;
    if (own + needed > 100) {
      report(`Recent cases holds up to 100 cases and the samples need ${needed}. Archive or delete ${own + needed - 100} of your cases, then load the samples again. Your cases were not changed.`);
      return false;
    }
    const now = Date.now(), image = exampleScreenshot();
    summaryCaseId = null;
    const loaded = commitCaseChange(candidate => {
      // The samples' timers stay stopped, so a running case keeps its timer.
      const running = candidate.cases.find(note => note.started !== null && !CaseExample.isSample(note.id));
      const timer = running && { started: running.started, elapsed: running.elapsed, lastSession: running.lastSession };
      for (const collection of ["cases","archive","trash"]) candidate[collection] = (candidate[collection] || []).filter(note => !CaseExample.isSample(note.id));
      for (const id of CaseExample.IDS) delete candidate.revisions?.[id];
      for (const sample of CaseExample.buildAll({ now, customFields: candidate.fieldConfig.customFields, image }).reverse()) {
        CaseNotes.create(candidate, sample.id, now);
        Object.assign(candidate.cases.find(note => note.id === sample.id), sample, { started: null });
      }
      candidate.selected = CaseExample.ID;
      if (running) Object.assign(running, timer);
    });
    if (loaded) $("copyStatus").textContent = "10 sample cases loaded. Their follow-ups show 2 overdue (red) and 3 due within 4 hours (yellow); the open sample has three dated notes. Explore or edit them freely, and archive or delete them from Recent cases when you are done.";
    return loaded;
  }
  // The tutorial opens the sample case so every control has content, then returns to the case you had open.
  window.CaseNotesExample = {
    open() {
      if (!writable || copying || !save()) return null;
      const previous = state.selected;
      if (!state.cases.some(note => note.id === CaseExample.ID)) return loadExampleNote({ confirmReset:false }) ? previous : null;
      summaryCaseId = null;
      if (previous !== CaseExample.ID && !commitCaseChange(candidate => { candidate.selected = CaseExample.ID; })) return null;
      return previous;
    },
    restore(previous) {
      if (!writable || copying || !save() || previous === undefined || previous === state.selected) return;
      if (previous !== null && !state.cases.some(note => note.id === previous)) return;
      summaryCaseId = null;
      commitCaseChange(candidate => { candidate.selected = previous; });
    }
  };
  
  const loadExampleBtn = $("loadExampleNote");
  if (loadExampleBtn) {
    loadExampleBtn.addEventListener("click", () => loadExampleNote());
  }
  
  // Customize Site Options (fields, hidden fields, Unlock layout, site effects) lives in case-field-customizer.js.
  const { readHidden } = window.CaseFieldCustomizer.init({
    key,
    state: () => state,
    replaceState,
    markDirty() { dirty = true; },
    save: () => save(), render: () => render(), selected: () => selected(),
    writable: () => writable, copying: () => copying,
    scheduleBackup: () => scheduleBackup(), safetyBefore: reason => safetyBefore(reason),
    refreshOptions: () => assist?.refreshOptions()
  });
  $("retrySave").addEventListener("click", save);
  $("noteForm").addEventListener("submit", event => event.preventDefault());
  
  // Sync all field values from form to note object
  function syncFormToNote(note) {
    if (!note) return;
    const effectiveFields = CaseNotes.getEffectiveFields(state);
    effectiveFields.forEach(({ id }) => {
      // Rich editor input already updates the canonical, sanitized note with
      // attachment references. Never persist rendered image data URLs here.
      if (id === "notes" || id === "next") return;
      const element = $(id);
      if (element) {
        note[id] = element.value;
      }
    });
  }
  
  function onCaseFieldInput(event) {
    if (!writable || copying) return;
    if (["notes","next"].includes(event.target.id) && !canEditEntry()) return;
    const effectiveFields = CaseNotes.getEffectiveFields(state);
    const fieldIds = effectiveFields.map(f => f.id);
    if (!fieldIds.includes(event.target.id)) return;
    const note = selected(); if (!note) return;
    const now = Date.now(); const restarting = note.started === null;
    CaseNotes.start(state, note, now);
    note[event.target.id] = event.target.value; note.updated = now; dirty = true;
    CaseNotes.syncEntry(note,now);
    status("Unsaved changes");
    $("copyStatus").textContent = "";
    if (restarting) save();
    tick(); caseList.renderSoon();
  }
  $("noteForm").addEventListener("input", onCaseFieldInput);
  // OS/Solution lives in Triage, outside the main case-details form.
  $("os").addEventListener("input", onCaseFieldInput);
  $("emailNote").addEventListener("click", () => {
    const note = selected();
    if (!note || !writable || copying) return;
    if (!note.request.trim()) {
      $("copyStatus").textContent = "Enter a Service Request Number before creating the email.";
      $("request").focus();
      return;
    }
    syncFormToNote(note);
    save();
    try {
      const now = Date.now();
      const content = window.CaseMarkdown.emailHtml(note, now, state.fieldConfig);
      const message = CaseNotes.emailFile(note, now, content, crypto.randomUUID(), state.fieldConfig);
      const url = URL.createObjectURL(new Blob([message], { type: "message/rfc822" }));
      const link = document.createElement("a"); link.href = url;
      link.download = "case-" + note.request.replace(/[^a-zA-Z0-9-]/g, "_").slice(0, 80) + ".eml";
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      $("copyStatus").textContent = "HTML email downloaded with inline screenshots. Open the .eml file in your email app, add the recipient, and send. Some apps open it as a message; use Forward or Edit as New if needed.";
    } catch {
      $("copyStatus").textContent = "Could not create the email file. Your note is unchanged. Try again, or use Copy to Lightning for a plain-text copy.";
    }
  });
  $("escalateNote").addEventListener("click", () => {
    const note = selected();
    if (!note || !writable || copying) return;
    syncFormToNote(note);
    if (!save()) return;
    try {
      const token = crypto.randomUUID();
      sessionStorage.setItem("dell-support.escalation." + token, JSON.stringify(CaseNotes.escalation(note, Date.now(), state.fieldConfig)));
      window.location.assign("escalation-quality.html#import=" + token + "&case=" + encodeURIComponent(note.id));
    } catch {
      $("copyStatus").textContent = "Could not open the escalation. Check browser storage access and try again. Your note is still here.";
    }
  });
  $("copyNote").addEventListener("click", async () => {
    const note = selected(); if (!note || !writable || copying) return;
    syncFormToNote(note);
    save(); // Copy remains available even if storage is full.
    // Only the selected day's notes; Copy case summary (in Case Summary) copies the whole case.
    const now = Date.now(); const text = CaseNotes.dayCopyText(note, now, state.fieldConfig);
    copying = true; controls(); history();
    try {
      await navigator.clipboard.writeText(text);
      CaseNotes.stop(note, now); note.updated = now; dirty = true;
      const saved = save();
      window.CopyRumble?.play();
      $("copyStatus").textContent = saved ? "Copied to clipboard. Timer stopped. Ready to paste into Lightning." : "Copied to clipboard. Timer stopped, but saving failed. Keep this tab open and retry saving.";
    } catch {
      $("copyStatus").textContent = "Could not copy. Timer was not stopped. Allow clipboard access and try Copy to Lightning again.";
    } finally { copying = false; controls(); history(); tick(); }
  });
  $("copyDevin").addEventListener("click", async () => {
    const note = selected(); if (!note || !writable || copying) return;
    syncFormToNote(note);
    save();
    const text = DevinPrompt.build($("devinTask").value, "Case Notes", CaseNotes.copyText(note, Date.now(), state.fieldConfig));
    copying = true; controls(); history();
    try {
      await navigator.clipboard.writeText(text);
      $("devinStatus").textContent = "Copied for AI. Open your AI tool, paste the prompt, and review its suggestions before applying them.";
    } catch {
      $("devinStatus").textContent = "Could not copy the AI prompt. Allow clipboard access and try again.";
    } finally { copying = false; controls(); history(); }
  });
  
  // AI task picker and the "Add your own" dialog are shared with the Escalation page.
  DevinPrompt.mountTaskManager($, { document, confirm: message => confirm(message) });
  setInterval(() => { if (dirty) save(); }, 10000);
  setInterval(tick, 1000);
  function updateFloatingActions() {
    const actions = $("copyActions");
    if (!actions?.getBoundingClientRect) return;
    const rect = actions.getBoundingClientRect();
    actions.classList.toggle("is-floating", window.scrollY > 0 && Math.abs(rect.bottom - (window.innerHeight - 16)) < 3);
  }
  window.addEventListener("scroll", updateFloatingActions, { passive:true });
  window.addEventListener("resize", updateFloatingActions);
  updateFloatingActions();
  const toolbox = $("floatingToolbox"), toolboxLauncher = $("toolboxLauncher");
  let toolboxMoved = false, toolboxStart;
  const setToolboxOpen = open => {
    toolbox.classList.toggle('is-open', open);
    if (!open) toolbox.style.removeProperty('--orbit');
    $('toolboxRadial').inert = !open;
    toolboxLauncher.setAttribute('aria-expanded', String(open));
    toolboxLauncher.setAttribute('aria-label', `${open ? 'Close' : 'Open'} case notes toolbox`);
    if (open) {
      const rect = toolbox.getBoundingClientRect();
      toolbox.style.right = 'auto'; toolbox.style.bottom = 'auto';
      // Shrink the orbit when the viewport is too small for the full ring, and center the ring if it still cannot fit.
      const half = toolbox.offsetWidth / 2, fit = Math.min(window.innerWidth, window.innerHeight) / 2 - 8 - 36;
      const orbit = Math.min(half + 79, Math.max(half + 36, fit));
      toolbox.style.setProperty('--orbit', `${orbit}px`);
      const margin = orbit + 36 + 16 - half;
      const place = (value, inner) => { const hi = inner - margin - toolbox.offsetWidth; return hi < margin ? (inner - toolbox.offsetWidth) / 2 : Math.max(margin, Math.min(hi, value)); };
      toolbox.style.left = `${place(rect.left, window.innerWidth)}px`;
      toolbox.style.top = `${place(rect.top, window.innerHeight)}px`;
      toolbox.querySelectorAll('[data-toolbox-action]').forEach(button => {
        button.disabled = $(toolboxTargets[button.dataset.toolboxAction]).matches(':disabled');
      });
    }
  };
  // Each quick action follows the enabled state of the matching page button. Log Collection Helper opens the dialog itself (data-log-helper); the others press their button.
  const toolboxTargets = {email:'emailNote',escalate:'escalateNote',copy:'copyNote',logs:'openLogHelper'};
  toolboxLauncher?.addEventListener("pointerdown", event => { toolboxStart = { x:event.clientX, y:event.clientY, left:toolbox.offsetLeft, top:toolbox.offsetTop }; toolboxMoved = false; toolboxLauncher.setPointerCapture(event.pointerId); });
  toolboxLauncher?.addEventListener("pointermove", event => { if (!toolboxStart) return; const dx=event.clientX-toolboxStart.x, dy=event.clientY-toolboxStart.y; if (Math.abs(dx)+Math.abs(dy)>5) { toolboxMoved=true; toolbox.style.right="auto"; toolbox.style.bottom="auto"; toolbox.style.left=`${Math.max(8,Math.min(window.innerWidth-toolbox.offsetWidth-8,toolboxStart.left+dx))}px`; toolbox.style.top=`${Math.max(8,Math.min(window.innerHeight-toolbox.offsetWidth-8,toolboxStart.top+dy))}px`; } });
  toolboxLauncher?.addEventListener('pointerup', event => { if (!toolboxStart) return; toolboxLauncher.releasePointerCapture(event.pointerId); toolboxStart=null; });
  toolboxLauncher?.addEventListener('pointercancel', () => { toolboxStart=null; toolboxMoved=false; });
  toolboxLauncher?.addEventListener('click', () => { if (toolboxMoved) { toolboxMoved=false; return; } setToolboxOpen(!toolbox.classList.contains('is-open')); });
  toolbox?.addEventListener('keydown', event => { if (event.key === 'Escape') { setToolboxOpen(false); toolboxLauncher.focus(); } });
  toolbox?.addEventListener('click', event => { const action=event.target.closest('[data-toolbox-action]')?.dataset.toolboxAction; if (!action) return; const target=$(toolboxTargets[action]); setToolboxOpen(false); if (action !== 'logs' && !target.matches(':disabled')) target.click(); });
  toolboxLauncher?.setAttribute("aria-description", "Press Enter to open quick actions. Hold Alt and press arrow keys to move the toolbox.");
  toolboxLauncher?.addEventListener("keydown", event => {
    const direction = {ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[event.key];
    if (!event.altKey || !direction) return;
    event.preventDefault(); const rect = toolbox.getBoundingClientRect();
    toolbox.style.right = "auto"; toolbox.style.bottom = "auto";
    toolbox.style.left = Math.max(8,Math.min(window.innerWidth-toolbox.offsetWidth-8,rect.left+direction[0])) + "px";
    toolbox.style.top = Math.max(8,Math.min(window.innerHeight-toolbox.offsetWidth-8,rect.top+direction[1])) + "px";
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") setToolboxOpen(false);
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === "f") {
      event.preventDefault(); historyCollapsed = false; setHistoryCollapsed(false); $("search").focus();
    }
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });
  window.addEventListener("beforeunload", event => {
    save();
    if (dirty || copying) { event.preventDefault(); event.returnValue = ""; }
  });
  window.addEventListener("pagehide", () => { save(); writable = false; release?.(); release = null; });
  window.addEventListener("storage", event => {
    if (!writable && (event.key === key || event.key === null)) { load(); render(); }
  });
  // Escalation Quality's Return to Case Notes link reopens the case it came from (case-notes.html#case=<id>).
  function openCaseFromLink() {
    const id = new URLSearchParams((window.location?.hash || "").slice(1)).get("case");
    if (!id) return;
    try { window.history.replaceState(null, "", window.location.pathname + window.location.search); } catch {}
    if (!state.cases.some(note => note.id === id)) { $("copyStatus").textContent = "The case you returned from is no longer in Recent Cases. Choose a case from the list."; return; }
    state.selected = id; dirty = true; save(); render();
  }
  // Other pages' Settings menus link here (case-notes.html#backup-restore or #customize-fields).
  function openSettingsFromLink() {
    const target = {"#backup-restore":"openBackupRestore","#customize-fields":"customizeFields"}[window.location?.hash];
    if (!target) return;
    // window.history: this file defines its own history() for the case list.
    try { window.history.replaceState(null, "", window.location.pathname + window.location.search); } catch {}
    $(target)?.click();
  }
  // The editor lock (one editing tab at a time, waiting and Take over) lives in case-notes-lock.js.
  const editorLock = window.CaseNotesLock.create({
    prepare() { load(); render(); return !loadFailed; },
    async hold() {
      load();
      if (loadFailed) return;
      if(notesPopout?.caseId) {
        if(!state.cases.some(note=>note.id===notesPopout.caseId)) {
          state.selected=null;notesPopout.unavailable();render();
          $("lockNotice").textContent="The requested case is unavailable. Return to the full workspace to choose a case.";
          return;
        }
        state.selected=notesPopout.caseId;
      }
      writable = true; $("lockNotice").hidden = true; render();
      // A problem with a #case= or #settings link must not cost this tab its editing lock.
      try { openCaseFromLink(); openSettingsFromLink(); } catch { /* The workspace opens as usual. */ }
      await new Promise(resolve => { release = resolve; });
    },
    lost() { writable = false; release = null; controls(); render(); },
    editing: () => writable,
    saveNow: () => save()
  });
  const acquire = () => editorLock.acquire();
  window.addEventListener("pageshow", event => { if (event.persisted) acquire(); });
  // Fields a Notes slash command can fill: the case details, then the triage and workflow fields.
  function slashFields() {
    const describe = (id, label, element) => ({ id, label, element, custom: Object.hasOwn(state.fieldConfig.customFields, id),
      options: element?.tagName === "SELECT" ? Array.from(element.options).filter(option => !option.hasAttribute("data-legacy-option")).map(option => ({ value: option.value, text: option.textContent })) : undefined });
    const fields = CaseNotes.getEffectiveFields(state).map(({ id, label }) => describe(id, label, $(id)));
    fields.push(describe("caseIssueType", "Issue type", $("caseIssueType")));
    if (!$("productAppLabel")?.hidden) fields.push(describe("productApp", "Product/Application", $("productApp")));
    document.querySelectorAll("[data-workflow-field]").forEach(element => {
      if (element.type === "checkbox") return;
      fields.push(describe(element.dataset.workflowField, element.closest("label")?.firstChild?.textContent.trim() || element.dataset.workflowField, element));
    });
    return fields.filter(field => field.element);
  }
  const slash = {
    commands: () => CaseSlash.commands(slashFields()),
    // Fill the field through its own input and change events, so it saves like typing does.
    apply(line) {
      const parsed = CaseSlash.parseLine(line, slash.commands());
      if (!parsed) return null;
      const result = CaseSlash.resolveValue(parsed.cmd, parsed.value);
      if (!result.ok) return { error: result.reason };
      const element = parsed.cmd.field.element;
      if (element.disabled) return { error: `${parsed.cmd.label} cannot be changed right now.` };
      element.value = element.maxLength > 0 ? result.value.slice(0, element.maxLength) : result.value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      const shown = result.text ?? element.value;
      return { text: CaseSlash.plainText(parsed.cmd, shown), status: `${parsed.cmd.label} set to ${shown}.` };
    }
  };
  window.CaseMarkdown?.init({
    current: selected,
    canEdit: canEditEntry,
    slash: typeof CaseSlash === "undefined" ? undefined : slash,
    update(field, value, images) {
      const note = selected();
      if (!note || !canEditEntry()) return;
      if (images) note.images = images;
      $(field).value = value;
      $(field).dispatchEvent(new Event("input", { bubbles: true }));
      if (images) save();
    }
  });
  window.CaseToolkit?.init({
    save,
    ask: askChoice,
    current: selected,
    canEdit: canEditEntry,
    mutate(change, immediate = true) {
      const note = selected(); if (!note || !canEditEntry()) return;
      change(note);
      const now = Date.now(); CaseNotes.start(state, note, now); note.updated = now;
      dirty = true; status("Unsaved changes");
      if (immediate) save();
      tick(); history();
    },
    refreshEditors: () => { const note = selected(); if (!note) return; $("notes").value = note.notes; $("next").value = note.next; window.CaseMarkdown?.refresh(); }
  });
  assist = window.CaseNotesAssist?.init({
    cases: () => state.cases,
    isSample: id => CaseExample.isSample(id),
    allCases: () => ["cases","archive","trash"].flatMap(collection => (state[collection] || []).map(note => ({ note, collection }))),
    selected,
    ask: askChoice,
    backup: scheduleBackup,
    timerRunning: () => writable && state.cases.some(note => note.started !== null),
    // Takes the away period off the running timer, which keeps running from now.
    discardTime(from, to) {
      const note = state.cases.find(item => item.started !== null); if (!note || !writable) return;
      CaseNotes.stop(note, Math.max(note.started, from)); note.started = to; dirty = true; save(); tick();
      $("copyStatus").textContent = "Away time removed from the timer.";
    },
    open(id, collection = "cases") {
      const note = (state[collection] || []).find(item => item.id === id); if (!note) return;
      if (collection !== "cases") { showStoredCase(note, collection); return; }
      selectCase(id);
    },
    showFollowups(filter) {
      $("caseCollection").value = "cases"; $("followupFilter").value = filter; $("search").value = "";
      if ($("caseHistory").hidden) $("toggleHistory").click();
      history(); $("historyList").scrollIntoView?.({ block: "nearest" });
    }
  });
  window.LogHelper?.init({
    context: () => { const note=selected(); return {id:note?.id,os:note?.os,platform:note?.platform,symptom:note?.toolkit?.issueType}; }
  });
  window.CaseRubric?.init({ current: selected });
  notesPopout=window.CaseNotesPopout?.init({
    current:selected,
    canEdit:()=>writable && !copying,
    save,
    suspend(){
      writable=false;release?.();release=null;controls();
    },
    resume:acquire
  });
  if (window.DevinIntegration && window.DevinConnection) {
    let session;
    try { session = window.sessionStorage; } catch {}
    devinIntegration = window.DevinIntegration.init({
      client: window.DevinConnection.createClient({sessionStorage:session}),
      sourceLabel:"Case Notes",
      isPopout: /(?:\?|&)notesWindow=1(?:&|$)/.test(window.location?.search || ""),
      canSend: () => !!selected() && writable && !copying,
      snapshot() {
        const note=selected();if(!note||!writable||copying)return null;
        syncFormToNote(note);save();
        return {caseId:note.id,entryId:note.activeEntryId,prompt:DevinPrompt.build($("devinTask").value,"Case Notes",CaseNotes.copyText(note,Date.now(),state.fieldConfig))};
      },
      canAppend: (id,entryId) => !!selected() && selected().id===id && canEditEntry() && (entryId ? selected().activeEntryId===entryId : selected().entries.length===1),
      appendResponse(id,text,entryId) {
        const note=selected();if(!note||note.id!==id||!canEditEntry()||(entryId ? note.activeEntryId!==entryId : note.entries.length!==1))return false;
        syncFormToNote(note);
        const existing=typeof marked!=="undefined"?marked.parse(note.notes,{gfm:true,breaks:true}):note.notes;
        const value=existing+"<p><strong>Devin suggestion (reviewed by agent)</strong></p><p>"+escapeHtml(text).replace(/\n/g,"<br>")+"</p>";
        $("notes").value=value;
        onCaseFieldInput({target:{id:"notes",value}});
        window.CaseMarkdown?.refresh();save();
        // Returning true means appended, even if storage is full: avoid adding it twice.
        return true;
      }
    });
  }
  acquire();
})();
