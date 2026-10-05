"use strict";
(() => {
  const key = "dell-support.case-notes.v1";
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value).replace(/[&<>"']/g,char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  let state = CaseNotes.empty(), dirty = false, writable = false, copying = false, release;
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
    customizeFields: "Choose which case fields appear and their order.",
    toggleHistory: "Show or hide the list of saved case notes.",
    chooseSyncFolder: "Choose the folder where backups are saved. A OneDrive-synced folder is ideal.",
    backupNow: "Save a backup of your case history and settings right now.",
    openRestore: "Go back to an earlier backup of your case history or settings.",
    stopTimer: "Stop time tracking for the current case.",
    emailNote: "Download the case notes as an email draft with screenshots.",
    escalateNote: "Open a pre-filled escalation request using these case details.",
    copyNote: "Copy the case notes to paste into Lightning and stop the timer.",
    manageAiTasks: "Add or manage your own AI prompts and skills.",
    copyDevin: "Copy the selected AI prompt with the current case context.",
    toggleActionDock: "Keep the action dock in place instead of floating while you scroll.",
    openLogHelper: "Get a collection plan based on the selected OS and issue.",
    toolboxLauncher: "Open the draggable quick-action toolbox."
  };
  const toolkitTooltips = {
    templates: "Open reusable note templates for the current case.",
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
  // ---- Backup & Restore ------------------------------------------------------------------------------
  // Engine and file handling live in case-sync-core.js; this block is the dialogs and the page wiring.
  const retentionKey = "dell-support.backup-retention-days", snoozeKey = "dell-support.backup-warning-snoozed-until";
  const DAY_MS = 86400000, noticeKey = "dell-support.restore-notice";
  let backupChosen = null, backupRoot = null, backupQueue = Promise.resolve(), backupTimer = null, lastBackupRun = 0;
  let backupInfo = null, backupProblem = null, needsPermission = false, awaitingChoice = false, restoreKind = "history";
  const supportsSync = () => typeof window.showDirectoryPicker === "function" && typeof indexedDB !== "undefined";
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const retentionSetting = () => { try { const v = localStorage.getItem(retentionKey); return Object.hasOwn(CaseBackup.RETENTION_OPTIONS, v) ? v : CaseBackup.DEFAULT_RETENTION; } catch { return CaseBackup.DEFAULT_RETENTION; } };
  const retentionLabel = () => { const days = CaseBackup.retentionDays(retentionSetting()); return days === null ? "Keeping every automatic snapshot." : `Automatic snapshots are kept ${days} days.`; };
  const folderLabel = () => !backupChosen ? "" : backupRoot && backupRoot.name !== backupChosen.name ? `${backupChosen.name}/${backupRoot.name}` : backupChosen.name;
  const clock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const dayName = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
  function friendlyTime(time) {
    const date = new Date(time), midnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((midnight(new Date()) - midnight(date)) / DAY_MS);
    return `${days === 0 ? "Today" : days === 1 ? "Yesterday" : dayName.format(date)}, ${clock.format(date)}`;
  }
  function ago(time) {
    const minutes = Math.round((Date.now() - time) / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${plural(minutes, "minute")} ago`;
    if (minutes < 60 * 12) return `${plural(Math.round(minutes / 60), "hour")} ago`;
    return friendlyTime(time);
  }
  function friendlyError(error) {
    if (error?.name === "NotAllowedError" || error?.name === "SecurityError") return "The browser blocked access to the backup folder. Select Reconnect Backup Folder.";
    if (error?.name === "QuotaExceededError" || /disk full|no space/i.test(error?.message || "")) return "The backup folder is full. Free some space, or use Clean Up Now.";
    if (error?.name === "NotFoundError") return "The backup folder or a file in it could not be found. Choose the folder again.";
    return error?.message || "Unknown error.";
  }
  const queued = task => { const run = backupQueue.then(task, task); backupQueue = run.catch(() => {}); return run; };
  async function hasPermission() { try { return !!backupChosen && await backupChosen.queryPermission({ mode: "readwrite" }) === "granted"; } catch { return false; } }
  async function getRoot(interactive = false) {
    if (!backupChosen) return null;
    const ok = interactive ? await CaseSync.ensurePermission(backupChosen) : await hasPermission();
    needsPermission = !ok;
    if (!ok) return null;
    backupRoot = await CaseSync.resolveRoot(backupChosen);
    return backupRoot;
  }
  function settingsSnapshot() {
    const storedJson = (storageKey, fallback) => {
      try { return JSON.parse(localStorage.getItem(storageKey) || JSON.stringify(fallback)); } catch { return fallback; }
    };
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      fieldConfig: state.fieldConfig,
      toolbox: {
        shortcuts: storedJson("dell-support.toolbox-links.v1", []),
        appearance: storedJson("dell-support.toolbox-appearance.v1", { order: [], colors: {} })
      },
      preferences: CaseSettings.capture(localStorage)
    }, null, 2);
  }
  // ---- status display
  const backupSnoozed = () => { try { return Number(localStorage.getItem(snoozeKey)) > Date.now(); } catch { return false; } };
  function renderBackupState() {
    const card = $("backupStateCard"), headline = $("backupHeadline"), detail = $("backupDetail");
    let mode, text, more;
    if (!supportsSync()) { mode = "unsupported"; text = "Folder backup isn't available in this browser"; more = "Use Chrome or Edge for automatic backups, or download copies below."; }
    else if (!backupChosen) { mode = "none"; text = "Not backed up yet"; more = "Your notes are saved only in this browser. Choose a folder (a OneDrive folder is ideal) and Case Notes will back up automatically."; }
    else if (needsPermission) { mode = "paused"; text = "Backups are paused"; more = `Your browser needs permission to use ${folderLabel()} again. Select Reconnect Backup Folder.`; }
    else if (backupProblem) { mode = "error"; text = "The last backup didn't finish"; more = backupProblem; }
    else if (awaitingChoice) { mode = "paused"; text = "Backups are waiting for your choice"; more = `${folderLabel()} already contains backups. Restore from them, or select Back Up Now to keep your current notes and replace the latest copy.`; }
    else { mode = "ok"; text = backupInfo?.lastBackup ? `Backed up ${ago(backupInfo.lastBackup)}` : "Backup folder connected"; more = `${folderLabel()}${backupInfo ? ` · ${plural(backupInfo.snapshots, "snapshot")} · ${CaseBackup.formatBytes(backupInfo.bytes)}` : ""}`; }
    if (card) card.dataset.state = mode;
    if (headline) headline.textContent = text;
    if (detail) detail.textContent = more;
    const connected = !!backupChosen && !needsPermission;
    if ($("chooseSyncFolder")) $("chooseSyncFolder").textContent = !backupChosen ? "Choose Backup Folder" : needsPermission ? "Reconnect Backup Folder" : "Change Backup Folder";
    if ($("chooseSyncFolder")) $("chooseSyncFolder").className = `button ${!backupChosen || needsPermission ? "primary" : "secondary"}`;
    for (const id of ["backupNow", "openRestore", "cleanupBackups", "deleteAllBackups", "startFresh"]) if ($(id)) $(id).disabled = !backupChosen;
    if ($("backupNow")) $("backupNow").className = `button ${connected ? "primary" : "secondary"}`;
    if ($("chooseSyncFolder")) $("chooseSyncFolder").disabled = !supportsSync();
    if ($("disconnectBackupFolder")) $("disconnectBackupFolder").disabled = !backupChosen;
    if ($("backupSummary")) $("backupSummary").textContent = backupInfo ? `${plural(backupInfo.snapshots, "snapshot")} · ${CaseBackup.formatBytes(backupInfo.bytes)} in the backup folder. ${retentionLabel()}` : retentionLabel();
    const banner = $("backupWarningBanner");
    if (banner) {
      const show = supportsSync() && (!backupChosen && !backupSnoozed() || needsPermission);
      banner.hidden = !show;
      if ($("backupWarningMessage")) $("backupWarningMessage").textContent = needsPermission ? "Automatic backups are paused until you reconnect your backup folder." : "Your notes are saved only in this browser. Set up a backup folder so you can recover them if browser data is cleared.";
      if ($("configureBackups")) $("configureBackups").textContent = needsPermission ? "Reconnect Backup Folder" : "Set Up Backups";
      if ($("dismissBackupWarning")) $("dismissBackupWarning").hidden = needsPermission;
    }
  }
  function backupMessage(message) { report(message, "backupFolderStatus"); renderBackupState(); }
  async function refreshSummary(root) {
    try { backupInfo = await CaseSync.summary(root); } catch { backupInfo = null; }
    renderBackupState();
  }
  async function restoreBackupFolder() {
    if (!supportsSync()) { renderBackupState(); return; }
    try {
      const restored = await CaseSync.restoreFolder();
      backupChosen = restored.handle || null;
      if (backupChosen) { const root = await getRoot(false); if (root) await refreshSummary(root); }
    } catch { backupChosen = null; }
    renderBackupState();
  }
  // ---- confirmation dialog: buttons are [{label, value, primary}]; Escape resolves null
  function askChoice({ title, message, buttons, typeToConfirm = null }) {
    const dialog = $("backupConfirmDialog");
    return new Promise(resolve => {
      $("backupConfirmTitle").textContent = title;
      $("backupConfirmMessage").textContent = message;
      const input = $("backupConfirmInput"), typeRow = $("backupConfirmTypeLabel"), actions = $("backupConfirmButtons");
      typeRow.hidden = !typeToConfirm; input.value = "";
      if (typeToConfirm) $("backupConfirmWord").textContent = typeToConfirm;
      actions.textContent = "";
      const guarded = [];
      let done = false;
      const finish = value => { if (done) return; done = true; dialog.removeEventListener("close", onClose); if (dialog.open) dialog.close(); resolve(value); };
      const onClose = () => finish(null);
      for (const choice of buttons) {
        const button = document.createElement("button");
        button.type = "button"; button.className = `button ${choice.primary ? "primary" : "secondary"}`; button.textContent = choice.label;
        if (typeToConfirm && choice.value) { button.disabled = true; guarded.push(button); }
        button.addEventListener("click", () => finish(choice.value));
        actions.append(button);
      }
      input.oninput = () => guarded.forEach(button => { button.disabled = input.value.trim().toUpperCase() !== typeToConfirm; });
      dialog.addEventListener("close", onClose);
      dialog.showModal();
      (typeToConfirm ? input : actions.querySelector(".primary") || actions.firstChild)?.focus();
    });
  }
  // ---- backing up
  function runBackup(manual = false) {
    return queued(async () => {
      const root = await getRoot(manual);
      if (!root) { renderBackupState(); if (manual) throw Error("Reconnect the backup folder first."); return null; }
      try {
        const result = await CaseSync.backup(root, { state, settingsJson: settingsSnapshot(), manual, retention: retentionSetting() });
        lastBackupRun = Date.now(); backupProblem = null; backedUpSettings = settingsFingerprint();
        await refreshSummary(root);
        return result;
      } catch (error) { backupProblem = friendlyError(error); renderBackupState(); throw error; }
    });
  }
  // A change is backed up a few seconds after saving, and at most every 30 seconds; the newest change is never skipped.
  function scheduleBackup() {
    if (!backupChosen || !writable || awaitingChoice || backupTimer) return;
    backupTimer = setTimeout(() => { backupTimer = null; runBackup().catch(() => {}); }, Math.max(3000, 30000 - (Date.now() - lastBackupRun)));
  }
  // Toolbox, theme, templates and other preferences live outside the case history, so a settings change must trigger a backup on its own.
  const settingsFingerprint = () => { try { const value = JSON.parse(settingsSnapshot()); delete value.exportedAt; return JSON.stringify(value); } catch { return ""; } };
  let backedUpSettings = null;
  setInterval(() => {
    if (!backupChosen || !writable || awaitingChoice || backupTimer) return;
    const now = settingsFingerprint();
    if (backedUpSettings === null) { backedUpSettings = now; return; }
    if (now !== backedUpSettings) { backedUpSettings = now; scheduleBackup(); }
  }, 12000);
  async function chooseBackupFolder() {
    if (!supportsSync()) { backupMessage("This browser can't save to a folder. Use Chrome or Edge, or download a copy instead."); return; }
    let picked;
    try { picked = await window.showDirectoryPicker({ id: "pro-support-tools-sync", mode: "readwrite", startIn: "documents" }); }
    catch (error) { if (error?.name !== "AbortError") backupMessage("The backup folder was not set."); return; }
    try {
      backupChosen = picked; needsPermission = false; backupProblem = null;
      await CaseSync.storeFolder(picked, picked.name);
      const root = await getRoot(true);
      if (!root) { backupMessage("Folder access was not approved."); return; }
      await refreshSummary(root);
      if (backupInfo?.hasBackups) await existingBackupsChoice();
      else { await runBackup(); backupMessage(`Backup folder ready: ${folderLabel()}. Your notes were backed up and will stay backed up automatically.`); }
    } catch (error) { backupProblem = friendlyError(error); backupMessage(`Could not set up the backup folder. ${backupProblem}`); }
  }
  // A folder that already holds backups (a new computer, a reinstall) must never be silently overwritten.
  async function existingBackupsChoice() {
    awaitingChoice = true; renderBackupState();
    const when = backupInfo.lastBackup ? ` The newest was saved ${friendlyTime(backupInfo.lastBackup)}.` : "";
    const empty = !state.cases.length && !state.archive.length;
    const choice = await askChoice({
      title: "This folder already has backups",
      message: `${folderLabel()} contains ${plural(backupInfo.snapshots, "snapshot")}.${when} ${empty ? "Your notes here are empty, so restoring is probably what you want." : "Restoring replaces the notes in this browser; keeping your current notes replaces the folder's latest copy (older snapshots are kept)."}`,
      buttons: [{ label: "Restore from these backups", value: "restore", primary: empty }, { label: "Keep my current notes and back up here", value: "keep", primary: !empty }, { label: "Decide later", value: null }]
    });
    if (choice === "restore") { const menu = $("backupRestoreMenu"); if (menu && !menu.open) menu.showModal(); await openRestore("history"); }
    else if (choice === "keep") { awaitingChoice = false; await runBackup(true).catch(() => {}); backupMessage("Backups are on. Your current notes were saved to the folder."); }
    else backupMessage("Backups are paused until you restore or choose Back Up Now.");
  }
  async function backUpNow() {
    if (!backupChosen) return;
    try {
      if (awaitingChoice) {
        const ok = await askChoice({ title: "Replace the folder's latest copy?", message: "The folder already holds backups. Backing up now replaces its latest copy with the notes in this browser. Older snapshots are kept.", buttons: [{ label: "Back up and replace latest", value: true, primary: true }, { label: "Cancel", value: false }] });
        if (!ok) return;
        awaitingChoice = false;
      }
      await runBackup(true);
      backupMessage(`Backed up to ${folderLabel()} at ${new Date().toLocaleTimeString()}. A named copy was added to the list.`);
    } catch (error) { backupMessage(`Backup failed. ${friendlyError(error)}`); }
  }
  // ---- restore
  const KIND_LABEL = { latest: "Latest copy, refreshed after every change", auto: "Automatic snapshot", manual: "Manual backup", safety: "Safety copy" };
  const REASON_LABEL = { restore: "saved before a restore", "delete-all": "saved before deleting backups", "start-fresh": "saved before starting fresh", "field-removal": "saved before removing a field", "field-reset": "saved before resetting fields" };
  const describeKind = item => item.kind === "safety" ? `Safety copy, ${REASON_LABEL[item.reason] || "saved automatically before a change"}` : KIND_LABEL[item.kind];
  const groupTitles = [["latest", "Most recent"], ["manual", "Manual backups"], ["safety", "Safety copies"], ["auto", "Automatic snapshots"]];
  function setRestoreKind(kind) {
    restoreKind = kind;
    for (const [id, name] of [["tabHistory", "history"], ["tabSettings", "settings"]]) { const tab = $(id); if (tab) { tab.setAttribute("aria-selected", String(name === kind)); tab.tabIndex = name === kind ? 0 : -1; } }
  }
  async function openRestore(kind = restoreKind) {
    setRestoreKind(kind);
    const dialog = $("restoreDialog");
    if (!dialog.open) dialog.showModal();
    $("restoreStatus").textContent = "Loading backups…";
    $("restoreList").textContent = "";
    const root = await getRoot(true).catch(() => null);
    if (!root) { $("restoreStatus").textContent = backupChosen ? "Reconnect the backup folder to see your backups." : "No backup folder is set up. Choose a file below, or close this and choose a backup folder."; return; }
    let items;
    try { items = (await CaseSync.listSnapshots(root)).filter(item => item.type === restoreKind); }
    catch (error) { $("restoreStatus").textContent = `Could not read the backup folder. ${friendlyError(error)}`; return; }
    const list = $("restoreList");
    $("restoreStatus").textContent = items.length ? `${plural(items.length, "backup")} found. Newest first within each group.` : `No ${restoreKind === "history" ? "case history" : "settings"} backups yet. Select Back Up Now in Backup & Restore to create one.`;
    for (const [kind, title] of groupTitles) {
      const group = items.filter(item => item.kind === kind);
      if (!group.length) continue;
      const heading = document.createElement("p"); heading.className = "dropdown-label"; heading.textContent = title; list.append(heading);
      for (const item of group) list.append(restoreRow(item));
    }
  }
  function restoreRow(item) {
    const row = document.createElement("div"); row.className = "backup-row"; row.setAttribute("role", "listitem");
    const when = friendlyTime(item.time);
    const text = document.createElement("div"); text.className = "backup-row-main";
    const strong = document.createElement("strong"); strong.textContent = when;
    const small = document.createElement("span"); small.textContent = `${describeKind(item)} · ${CaseBackup.formatBytes(item.size)}`;
    text.append(strong, small);
    const restore = document.createElement("button"); restore.type = "button"; restore.className = "button primary"; restore.textContent = "Restore"; restore.setAttribute("aria-label", `Restore the backup from ${when}`);
    restore.addEventListener("click", () => void restoreSnapshot(item, when));
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "button secondary"; remove.textContent = "Delete"; remove.setAttribute("aria-label", `Delete the backup from ${when}`);
    remove.addEventListener("click", () => void deleteSnapshot(item, when));
    row.append(text, restore, remove);
    return row;
  }
  async function deleteSnapshot(item, when) {
    const ok = await askChoice({ title: "Delete this backup?", message: `${describeKind(item)} from ${when} will be permanently deleted from the backup folder. Your current notes are not affected.${item.kind === "latest" ? " The most recent backup is recreated the next time your notes are backed up." : ""}`, buttons: [{ label: "Delete backup", value: true, primary: true }, { label: "Keep it", value: false }] });
    if (!ok) return;
    try {
      const root = await getRoot(true);
      if (!root) throw Error("Reconnect the backup folder first.");
      await queued(() => CaseSync.deleteSnapshot(root, item.name));
      await refreshSummary(root);
      await openRestore(restoreKind);
      $("restoreStatus").textContent = `Deleted the backup from ${when}.`;
    } catch (error) { $("restoreStatus").textContent = `Could not delete it. ${friendlyError(error)}`; }
  }
  // Applies already-validated backups to this browser. Parsing happens first so a bad file changes nothing.
  function applyRestore(restoredHistory, restoredSettings) {
    const values = restoredSettings?.values || {};
    const nextState = restoredHistory ? CaseNotes.parse(JSON.stringify(restoredSettings ? { ...restoredHistory, fieldConfig: restoredSettings.fieldConfig } : restoredHistory)) : null;
    if (nextState) localStorage.setItem(key, JSON.stringify(nextState));
    if (restoredSettings) CaseSettings.commit(localStorage, values);
    if (nextState) { state = nextState; savedState = JSON.parse(JSON.stringify(state)); }
    if (restoredSettings && !nextState) {
      state = CaseNotes.parse(JSON.stringify({ ...state, fieldConfig: restoredSettings.fieldConfig }));
      localStorage.setItem(key, JSON.stringify(state));
      savedState = JSON.parse(JSON.stringify(state));
    }
    dirty = false;
    window.dispatchEvent(new Event("prosSupportToolboxRestore"));
    window.dispatchEvent(new Event("supportSettingsRestored"));
    render();
  }
  function checkSettings(text) {
    const restored = CaseSettings.validate(JSON.parse(text), CaseNotes.fields);
    for (const id of Object.keys(restored.fieldConfig.customFields)) {
      if (document.getElementById(id) && !Object.hasOwn(state.fieldConfig.customFields, id)) throw Error(`A custom field ID conflicts with a page control: ${id}`);
    }
    return restored;
  }
  // One path for folder snapshots and chosen files: validate, confirm, save a safety copy, then replace.
  async function restoreFlow({ kind, text, label }) {
    if (!writable || copying) { $("restoreStatus").textContent = "Another Case Notes window is editing right now. Close it, then try again."; return; }
    let history = null, settings = null;
    try {
      if (kind === "history") history = CaseNotes.parse(text); else settings = checkSettings(text);
    } catch (error) {
      $("restoreStatus").textContent = `That backup can't be restored, so nothing was changed. ${/screenshot/i.test(error?.message || "") ? "It stores screenshots in the backup folder's images folder: restore it from the list instead of choosing the file." : error?.message || ""}`.trim();
      return;
    }
    const mention = kind === "history"
      ? `This replaces the ${plural(state.cases.length, "case")} in this browser with ${plural(history.cases.length, "case")} from ${label}, including Archive, Trash and versions. Settings are not changed.`
      : `This replaces your settings (fields, toolbox, templates, preferences) with the ones from ${label}. Your case notes are kept.`;
    const root = backupChosen ? await getRoot(false).catch(() => null) : null;
    const safety = root ? " A safety copy of what you have now is saved first, so you can undo this from the list." : " No backup folder is connected, so no safety copy can be saved first.";
    const ok = await askChoice({ title: kind === "history" ? "Restore case history?" : "Restore settings?", message: mention + safety, buttons: [{ label: "Restore", value: true, primary: true }, { label: "Cancel", value: false }] });
    if (!ok) return;
    try {
      if (root) await queued(() => CaseSync.safetyCopy(root, kind === "history" ? { state, reason: "restore" } : { settingsJson: settingsSnapshot(), reason: "restore" }));
      applyRestore(history, settings);
      awaitingChoice = false;
      $("restoreDialog").close(); $("backupRestoreMenu")?.close();
      const done = `Restored ${kind === "history" ? "case history" : "settings"} from ${label}.${root ? " Your previous version was kept as a safety copy." : ""}`;
      report(done);
      if (root) { backedUpSettings = null; scheduleBackup(); await refreshSummary(root); }
      // Some preferences (theme, panel layout, AI prompts, toolbox position) are read once at page load: reload so every restored setting shows.
      if (kind === "settings") {
        try { sessionStorage.setItem(noticeKey, done); } catch {}
        setTimeout(() => { try { window.location.reload(); } catch {} }, 700);
      }
    } catch (error) { $("restoreStatus").textContent = `Could not restore. Nothing was changed. ${friendlyError(error)}`; }
  }
  async function restoreSnapshot(item, when) {
    try {
      const root = await getRoot(true);
      if (!root) throw Error("Reconnect the backup folder first.");
      const text = item.type === "history" ? await CaseSync.loadHistoryText(root, item.name) : await CaseSync.loadSettingsText(root, item.name);
      await restoreFlow({ kind: item.type, text, label: `the ${item.kind === "latest" ? "latest copy" : item.kind === "auto" ? "automatic snapshot" : item.kind === "manual" ? "manual backup" : "safety copy"} from ${when}` });
    } catch (error) { $("restoreStatus").textContent = `That backup can't be restored, so nothing was changed. ${friendlyError(error)}`; }
  }
  async function restoreFromChosenFile(file) {
    if (!file) return;
    let text;
    try { text = await file.text(); const value = JSON.parse(text); restoreKind = value && Array.isArray(value.cases) ? "history" : value && value.fieldConfig ? "settings" : null; if (!restoreKind) throw Error("This file isn't a Case Notes backup."); }
    catch (error) { $("restoreStatus").textContent = `Could not read that file. ${error instanceof SyntaxError ? "It isn't a valid backup." : error.message}`; return; }
    setRestoreKind(restoreKind);
    await restoreFlow({ kind: restoreKind, text, label: `the file ${file.name}` });
  }
  // ---- cleanup, delete, start fresh
  async function cleanUpNow() {
    try {
      const root = await getRoot(true);
      if (!root) throw Error("Reconnect the backup folder first.");
      const result = await queued(() => CaseSync.cleanup(root, { retention: retentionSetting() }));
      await refreshSummary(root);
      backupMessage(result.removed ? `Cleanup removed ${plural(result.removed, "old snapshot")}${result.images ? ` and ${plural(result.images, "unused screenshot file")}` : ""}, freeing ${CaseBackup.formatBytes(result.bytes)}. Manual backups and safety copies are always kept.` : `Nothing to clean up. ${retentionLabel()}`);
    } catch (error) { backupMessage(`Cleanup failed. ${friendlyError(error)}`); }
  }
  async function deleteAllBackups() {
    const ok = await askChoice({ title: "Delete all backups?", message: `Every snapshot, manual backup, safety copy and screenshot file in ${folderLabel()} will be permanently deleted. Your notes in this browser are not affected, and automatic backups start again the next time your notes change. Other files in the folder are never touched.`, typeToConfirm: "DELETE", buttons: [{ label: "Delete all backups", value: true, primary: true }, { label: "Cancel", value: false }] });
    if (!ok) return;
    try {
      const root = await getRoot(true);
      if (!root) throw Error("Reconnect the backup folder first.");
      const result = await queued(() => CaseSync.deleteAll(root));
      await refreshSummary(root);
      backupMessage(`Deleted ${plural(result.removed, "backup file")}${result.images ? ` and ${plural(result.images, "screenshot file")}` : ""}.`);
    } catch (error) { backupMessage(`Could not delete the backups. ${friendlyError(error)}`); }
  }
  async function startFresh() {
    if (!writable || copying) { backupMessage("Another Case Notes window is editing right now. Close it, then try again."); return; }
    const ok = await askChoice({ title: "Start completely fresh?", message: `This permanently deletes every backup in ${folderLabel()} AND erases all case notes, settings, templates and preferences in this browser. Nothing is kept: there is no safety copy and it cannot be undone. Consider downloading a copy first.`, typeToConfirm: "DELETE", buttons: [{ label: "Erase everything", value: true, primary: true }, { label: "Cancel", value: false }] });
    if (!ok) return;
    try {
      const root = await getRoot(true);
      if (!root) throw Error("Reconnect the backup folder first.");
      await queued(() => CaseSync.deleteAll(root));
      CaseSettings.commit(localStorage, CaseSettings.clearValues());
      state = CaseNotes.empty(); localStorage.setItem(key, JSON.stringify(state)); savedState = JSON.parse(JSON.stringify(state)); dirty = false; awaitingChoice = false;
      window.dispatchEvent(new Event("prosSupportToolboxRestore")); window.dispatchEvent(new Event("supportSettingsRestored"));
      render();
      await refreshSummary(root);
      $("backupRestoreMenu")?.close();
      report("Everything was erased and Case Notes is starting fresh. Automatic backups continue in the same folder once you add a case.");
    } catch (error) { backupMessage(`Could not finish starting fresh. ${friendlyError(error)}`); }
  }
  async function disconnectFolder() {
    const ok = await askChoice({ title: "Stop using this backup folder?", message: "Backups stop. Files already in the folder are not deleted, and you can choose the same folder again later.", buttons: [{ label: "Disconnect", value: true, primary: true }, { label: "Cancel", value: false }] });
    if (!ok) return;
    try { await CaseSync.forgetFolder(); } catch {}
    backupChosen = null; backupRoot = null; backupInfo = null; needsPermission = false; awaitingChoice = false; backupProblem = null;
    backupMessage("Backup folder disconnected. Your notes are saved only in this browser until you choose a folder.");
  }
  // Best effort: a failed safety copy never blocks the action, but a successful one makes it undoable from the restore list.
  async function safetyBefore(reason) {
    try {
      const root = backupChosen ? await getRoot(false) : null;
      if (root) await queued(() => CaseSync.safetyCopy(root, { state, reason }));
    } catch { /* the folder may be offline; the action itself proceeds as before */ }
  }
  function downloadText(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  // ---- wiring
  $("chooseSyncFolder")?.addEventListener("click", async () => {
    if (backupChosen && needsPermission) {
      try {
        const root = await getRoot(true);
        if (root) { await refreshSummary(root); if (awaitingChoice) await existingBackupsChoice(); else { await runBackup().catch(() => {}); backupMessage("Folder reconnected. Backups are running again."); } }
        else backupMessage("Folder access was not approved.");
        return;
      } catch { /* fall through and let the person choose the folder again */ }
    }
    await chooseBackupFolder();
  });
  $("backupNow")?.addEventListener("click", () => void backUpNow());
  $("openRestore")?.addEventListener("click", () => void openRestore("history"));
  $("tabHistory")?.addEventListener("click", () => void openRestore("history"));
  $("tabSettings")?.addEventListener("click", () => void openRestore("settings"));
  $("restoreFromFile")?.addEventListener("click", () => $("restoreFile")?.click());
  $("restoreFile")?.addEventListener("change", async event => { const file = event.target.files?.[0]; event.target.value = ""; await restoreFromChosenFile(file); });
  $("closeRestore")?.addEventListener("click", () => $("restoreDialog")?.close());
  $("cleanupBackups")?.addEventListener("click", () => void cleanUpNow());
  $("deleteAllBackups")?.addEventListener("click", () => void deleteAllBackups());
  $("startFresh")?.addEventListener("click", () => void startFresh());
  $("disconnectBackupFolder")?.addEventListener("click", () => void disconnectFolder());
  $("downloadHistory")?.addEventListener("click", () => downloadText(CaseBackup.fileName("history", "manual", Date.now()), JSON.stringify(state, null, 2)));
  $("downloadSettings")?.addEventListener("click", () => downloadText(CaseBackup.fileName("settings", "manual", Date.now()), settingsSnapshot()));
  const retentionSelect = $("backupRetention");
  if (retentionSelect) {
    retentionSelect.value = retentionSetting();
    retentionSelect.addEventListener("change", () => {
      if (!Object.hasOwn(CaseBackup.RETENTION_OPTIONS, retentionSelect.value)) return;
      try { localStorage.setItem(retentionKey, retentionSelect.value); } catch {}
      backupMessage(`${retentionLabel()} Older snapshots are cleaned up automatically after each hourly snapshot.`);
    });
  }
  $("closeBackupRestore")?.addEventListener("click", () => $("backupRestoreMenu")?.close());
  $("configureBackups")?.addEventListener("click", () => { if (backupChosen && needsPermission) $("chooseSyncFolder")?.click(); else openBackupDialog(); });
  $("dismissBackupWarning")?.addEventListener("click", () => {
    try { localStorage.setItem(snoozeKey, String(Date.now() + 7 * DAY_MS)); } catch {}
    renderBackupState();
  });
  function openBackupDialog() {
    window.SiteTopbar?.closeMenus();
    if (retentionSelect) retentionSelect.value = retentionSetting();
    $("backupRestoreMenu")?.showModal();
    getRoot(false).then(root => root ? refreshSummary(root) : renderBackupState()).catch(renderBackupState);
    renderBackupState();
  }
  $("openBackupRestore")?.addEventListener("click", openBackupDialog);
  window.addEventListener("pagehide", () => { if (backupTimer) { clearTimeout(backupTimer); backupTimer = null; void runBackup().catch(() => {}); } });
  renderBackupState();
  restoreBackupFolder();
  try { const notice = sessionStorage.getItem(noticeKey); if (notice) { sessionStorage.removeItem(noticeKey); report(`${notice} The page was reloaded so every setting shows.`); } } catch {}
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
    const title=document.createElement("h3"); title.textContent="Case Summary"; panel.append(title);
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

  function history() {
    const query = $("search").value.trim().toLowerCase();
    const filter = $("followupFilter").value || "all";
    const collection = ["archive","trash"].includes($("caseCollection")?.value) ? $("caseCollection").value : "cases";
    const sort = $("caseSort")?.value || "created";
    const now = Date.now();
    const matches = (state[collection] || []).filter(note => {
      const status = note.toolkit?.status || "Open";
      return (!query || CaseNotes.searchText(note).toLowerCase().includes(query)) && (filter === "all" || filter === "overdue" && CaseToolkitCore.overdue(note, now) || filter === "active" && status !== "Completed" || filter === "completed" && status === "Completed");
    }).sort((a,b) => Number(!!b.pinned)-Number(!!a.pinned) || (sort === "due" ? (Date.parse(a.toolkit?.due) || Infinity)-(Date.parse(b.toolkit?.due) || Infinity) : b[sort === "updated" ? "updated" : "created"]-a[sort === "updated" ? "updated" : "created"]));
    $("caseCount").textContent = collection === "cases" ? `${state.cases.length} / 100` : `${state[collection].length} ${collection === "archive" ? "archived" : "in Trash"}`;
    $("historyList").replaceChildren(...matches.map(note => {
      const button = document.createElement("button"); button.className = "case-item";
      button.setAttribute("aria-current", String(note.id === state.selected));
      button.disabled = copying;
      const title = document.createElement("strong"); title.textContent = (note.id === CaseExample.ID ? "Sample · " : "") + (note.request || note.tag || "Untitled case");
      const issue = document.createElement("span"); issue.textContent = query ? CaseNotes.excerpt(note,query) : note.issue || "No issue description yet";
      const meta = document.createElement("small"); meta.textContent = `${note.tag ? note.tag + " · " : ""}${new Date(note.created).toLocaleString()}`;
      button.append(title, issue, meta);
      if (note.toolkit) {
        const badge = document.createElement("small");
        const late = CaseToolkitCore.overdue(note, now);
        badge.className = late ? "followup-badge overdue" : "followup-badge";
        badge.textContent = `${late ? "Overdue · " : ""}${note.toolkit.status}${note.toolkit.owner ? " · " + note.toolkit.owner : ""}${note.toolkit.due ? " · " + new Date(note.toolkit.due).toLocaleString() : ""}`;
        button.append(badge);
      }
      const row = document.createElement("div"); row.className = "case-row";
      const remove = document.createElement("button");
      remove.className = "delete-case"; remove.type = "button";
      const caseName = note.tag || note.request || "Untitled case";
      remove.setAttribute("aria-label", "Delete case " + caseName);
      remove.title = collection === "trash" ? "Permanently delete this case" : "Move case to Trash";
      remove.disabled = !writable || copying;
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 24 24"); icon.setAttribute("aria-hidden", "true");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7");
      icon.append(path); remove.append(icon);
      remove.addEventListener("click", async () => {
        if (!writable || copying) return;
        if (!confirm(collection === "trash" ? `Permanently delete ${caseName} and its versions? This cannot be undone.` : `Move ${caseName} to Trash? You can restore it later.`)) return;
        if (!writable || copying || !save()) return;
        const permanent = collection === "trash";
        if (!commitCaseChange(candidate => {
          if (permanent) { candidate.trash = candidate.trash.filter(item => item.id !== note.id); delete candidate.revisions[note.id]; }
          else CaseNotes.move(candidate,note.id,collection,"trash",Date.now());
        }, "Could not delete the case. Check browser storage and try again. Your case has not been removed.")) return;
        status("Saved");
        report(permanent ? `${caseName} was permanently deleted.` : `${caseName} moved to Trash. Choose Trash in the case list to restore it.`);
        $("copyStatus").textContent = "";
      });
      row.append(button, remove);
      const rowActions = document.createElement("div"); rowActions.className = "case-row-actions";
      const addAction = (label,action) => {
        const control = document.createElement("button"); control.type = "button"; control.className = "button secondary";
        control.textContent = label; control.disabled = !writable || copying; control.setAttribute("aria-label",label + " " + caseName);
        control.addEventListener("click",action); rowActions.append(control);
      };
      if (collection === "cases") {
        addAction(note.pinned ? "Unpin" : "Pin", () => commitCaseChange(candidate => { candidate.cases.find(item => item.id === note.id).pinned = !note.pinned; }));
        addAction("Archive", () => commitCaseChange(candidate => CaseNotes.move(candidate,note.id,"cases","archive",Date.now())));
      } else addAction("Restore", () => commitCaseChange(candidate => CaseNotes.move(candidate,note.id,collection,"cases",Date.now())));
      row.append(rowActions);
      button.addEventListener("click", () => {
        if (collection !== "cases") { showStoredCase(note,collection); return; }
        if (copying || (writable && !save())) return;
        state.selected = note.id;
        if (writable) { dirty = true; save(); }
        render();
      }); return row;
    }));
    if (!matches.length) $("historyList").textContent = query ? "No matching cases." : "No cases yet.";
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
    if($("newCaseEntry"))$("newCaseEntry").disabled=!selected() || !writable || copying;
    $("caseEntryTabs")?.querySelectorAll("button").forEach(button=>{button.disabled=copying;});
    notesPopout?.refresh();
    devinIntegration?.refresh();
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
  function downloadFile(text,name,type) {
    const url = URL.createObjectURL(new Blob([text],{type}));
    const link = document.createElement("a"); link.href = url; link.download = name;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url),60000);
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
  const exampleExists = () => ["cases","archive","trash"].some(collection => (state[collection] || []).some(note => note.id === CaseExample.ID));
  // Adds the sample case, or resets it when it already exists. Other cases, and any running timer, are unchanged.
  function loadExampleNote({ confirmReset = true } = {}) {
    if (!writable || copying || !save()) return false;
    if (confirmReset && exampleExists() && !confirm("Reset the sample case? Any changes you made to it will be replaced.")) return false;
    // Never archive a real case to make room for the sample.
    if (!state.cases.some(note => note.id === CaseExample.ID) && state.cases.length >= 100) {
      report("Recent cases is full (100). Archive or delete a case, then load the sample again. Your cases were not changed.");
      return false;
    }
    const now = Date.now(), image = exampleScreenshot();
    summaryCaseId = null;
    const loaded = commitCaseChange(candidate => {
      // The sample's timer stays stopped, so a running case keeps its timer.
      const running = candidate.cases.find(note => note.started !== null && note.id !== CaseExample.ID);
      const timer = running && { started: running.started, elapsed: running.elapsed, lastSession: running.lastSession };
      for (const collection of ["cases","archive","trash"]) candidate[collection] = (candidate[collection] || []).filter(note => note.id !== CaseExample.ID);
      if (candidate.revisions) delete candidate.revisions[CaseExample.ID];
      CaseNotes.create(candidate, CaseExample.ID, now);
      Object.assign(candidate.cases.find(note => note.id === CaseExample.ID), CaseExample.build({ now, customFields: candidate.fieldConfig.customFields, image }), { started: null });
      if (running) Object.assign(running, timer);
    });
    if (loaded) $("copyStatus").textContent = "Sample case loaded with three dated notes. Explore or edit it freely; archive or delete it from Recent cases when you are done.";
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
  
  // Field customization. Changes are made to a draft and only reach case history on Save Configuration.
  let fieldDraft = null;
  const draftState = () => ({ fieldConfig: fieldDraft, cases: [], archive: [], trash: [], revisions: {} });
  const draftChanged = () => fieldDraft && JSON.stringify(fieldDraft) !== JSON.stringify(state.fieldConfig);
  function renderFieldCustomizer() {
    const orderList = $("fieldOrderList");
    orderList.replaceChildren();
    CaseNotes.getEffectiveFields(draftState()).forEach(({ id, label }) => {
      const item = document.createElement("div");
      item.className = "field-order-item";
      item.draggable = true;
      item.dataset.fieldId = id;
      const handle = document.createElement("span"); handle.className = "field-handle"; handle.textContent = "⋮⋮"; handle.setAttribute("aria-hidden", "true");
      const name = document.createElement("span"); name.className = "field-name"; name.textContent = label;
      item.append(handle, name);
      if (CaseNotes.fields[id]) { const builtin = document.createElement("span"); builtin.className = "field-builtin"; builtin.textContent = "✓ Built-in"; item.append(builtin); }
      item.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", id);
        item.classList.add("dragging");
      });
      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
      });
      for (const direction of [-1,1]) {
        const move = document.createElement("button"); move.type = "button"; move.className = "button secondary"; move.textContent = direction < 0 ? "↑" : "↓";
        move.setAttribute("aria-label", `Move ${label} ${direction < 0 ? "up" : "down"}`);
        move.addEventListener("click", () => {
          const neighbor = direction < 0 ? item.previousElementSibling : item.nextElementSibling;
          if (neighbor) { orderList.insertBefore(direction < 0 ? item : neighbor,direction < 0 ? neighbor : item); move.focus(); }
        }); item.append(move);
      }
      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        const dragging = orderList.querySelector(".dragging");
        if (dragging && dragging !== item) {
          const rect = item.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          if (e.clientY < midY) {
            orderList.insertBefore(dragging, item);
          } else {
            orderList.insertBefore(dragging, item.nextSibling);
          }
        }
      });
      orderList.appendChild(item);
    });
    const customList = $("customFieldsList");
    customList.replaceChildren();
    Object.entries(fieldDraft.customFields).forEach(([id, label]) => {
      const item = document.createElement("div");
      item.className = "custom-field-item";
      const idText = document.createElement("span"); idText.className = "field-id"; idText.textContent = id;
      const labelText = document.createElement("span"); labelText.className = "field-label"; labelText.textContent = label;
      const remove = document.createElement("button"); remove.className = "remove-field"; remove.type = "button"; remove.textContent = "Remove";
      remove.setAttribute("aria-label", "Remove " + label);
      remove.addEventListener("click", () => {
        try {
          keepDraftOrder();
          CaseNotes.removeCustomField(draftState(), id);
          renderFieldCustomizer();
          $("customizerStatus").textContent = `"${label}" will be removed when you choose Save Configuration.`;
        } catch (e) {
          $("customizerStatus").textContent = e.message;
        }
      });
      item.append(idText, labelText, remove);
      customList.appendChild(item);
    });
  }
  // Keep any reordering made in the list when the draft is redrawn.
  function keepDraftOrder() {
    const order = Array.from($("fieldOrderList").children).map(item => item.dataset.fieldId).filter(Boolean);
    if (order.length) fieldDraft.order = order;
  }
  function closeCustomizer() {
    keepDraftOrder();
    if (draftChanged() && !confirm("Discard your unsaved field changes?")) return;
    fieldDraft = null;
    $("fieldCustomizer").close();
  }
  $("customizeFields").addEventListener("click", () => {
    if (!writable || copying) return;
    window.SiteTopbar?.closeMenus();
    fieldDraft = JSON.parse(JSON.stringify(state.fieldConfig));
    renderFieldCustomizer();
    $("fieldCustomizer").showModal();
    $("customizerStatus").textContent = "";
  });
  $("closeCustomizer").addEventListener("click", closeCustomizer);
  $("fieldCustomizer").addEventListener("cancel", event => { event.preventDefault?.(); closeCustomizer(); });
  $("addCustomField").addEventListener("click", () => {
    if (!fieldDraft) return;
    const fieldId = $("newFieldId").value.trim();
    const fieldLabel = $("newFieldLabel").value.trim();
    if (!fieldId || !fieldLabel) {
      $("customizerStatus").textContent = "Enter both field ID and label.";
      return;
    }
    try {
      if (document.getElementById(fieldId) && !Object.hasOwn(state.fieldConfig.customFields, fieldId)) throw Error("That ID is already used by a page control. Choose another ID.");
      keepDraftOrder();
      CaseNotes.addCustomField(draftState(), fieldId, fieldLabel);
      $("newFieldId").value = "";
      $("newFieldLabel").value = "";
      renderFieldCustomizer();
      $("customizerStatus").textContent = `"${fieldLabel}" will be added when you choose Save Configuration.`;
    } catch (e) {
      $("customizerStatus").textContent = e.message;
    }
  });
  $("saveFieldConfig").addEventListener("click", async () => {
    if (!fieldDraft || !writable || copying) return;
    keepDraftOrder();
    const draft = fieldDraft;
    const removed = Object.keys(state.fieldConfig.customFields).filter(id => !Object.hasOwn(draft.customFields, id));
    if (removed.length) {
      const names = removed.map(id => `"${state.fieldConfig.customFields[id]}"`).join(", ");
      if (!confirm(`Remove ${names} and their values from recent cases, Archive, Trash, and saved versions?`)) return;
      if (!save() || !writable || copying || fieldDraft !== draft) return;
      await safetyBefore("field-removal");
    }
    try {
      if (!save()) throw Error("Could not save your current notes. Retry saving before changing fields.");
      const candidate = JSON.parse(JSON.stringify(state));
      removed.forEach(id => CaseNotes.removeCustomField(candidate, id));
      Object.entries(draft.customFields).forEach(([id, label]) => { if (!Object.hasOwn(candidate.fieldConfig.customFields, id)) CaseNotes.addCustomField(candidate, id, label); });
      CaseNotes.reorderFields(candidate, draft.order);
      const parsed = CaseNotes.parse(JSON.stringify(candidate));
      localStorage.setItem(key, JSON.stringify(parsed));
      state = parsed; savedState = JSON.parse(JSON.stringify(state)); dirty = false;
      fieldDraft = null;
      $("fieldCustomizer").close();
      render();
      $("copyStatus").textContent = "Field configuration saved.";
    } catch (e) {
      $("customizerStatus").textContent = e?.message && !/quota|storage/i.test(e.name || "") ? e.message : "Could not save field configuration. Export a backup and check browser storage.";
    }
  });
  $("resetFields").addEventListener("click", async () => {
    if (!writable || copying) return;
    if (confirm(`Reset field order and remove custom fields and their values from recent cases, Archive, Trash, and saved versions? This cannot be undone.`)) {
      if (!save() || !writable || copying) return;
      await safetyBefore("field-reset");
      CaseNotes.resetCustomFields(state);
      dirty = true;
      if (!save()) return;
      fieldDraft = null;
      $("fieldCustomizer").close();
      render();
      $("copyStatus").textContent = "Fields reset to default.";
    }
  });
  $("search").addEventListener("input", history);
  $("caseCollection")?.addEventListener("change", history);
  $("caseSort")?.addEventListener("change", history);
  $("followupFilter").addEventListener("change", history);
  setInterval(() => { if (!$("historyList").contains(document.activeElement)) history(); }, 60000);
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
    tick(); history();
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
      window.location.assign("escalation-quality.html#import=" + token);
    } catch {
      $("copyStatus").textContent = "Could not open the escalation. Check browser storage access and try again. Your note is still here.";
    }
  });
  $("copyNote").addEventListener("click", async () => {
    const note = selected(); if (!note || !writable || copying) return;
    syncFormToNote(note);
    save(); // Copy remains available even if storage is full.
    const now = Date.now(); const text = CaseNotes.copyText(note, now, state.fieldConfig);
    copying = true; controls(); history();
    try {
      await navigator.clipboard.writeText(text);
      CaseNotes.stop(note, now); note.updated = now; dirty = true;
      const saved = save();
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
  const aiTasks = DevinPrompt.mountTaskManager($, { document, confirm: message => confirm(message) });
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
        button.disabled = $({email:'emailNote',escalate:'escalateNote',copy:'copyNote'}[button.dataset.toolboxAction]).disabled;
      });
    }
  };
  toolboxLauncher?.addEventListener("pointerdown", event => { toolboxStart = { x:event.clientX, y:event.clientY, left:toolbox.offsetLeft, top:toolbox.offsetTop }; toolboxMoved = false; toolboxLauncher.setPointerCapture(event.pointerId); });
  toolboxLauncher?.addEventListener("pointermove", event => { if (!toolboxStart) return; const dx=event.clientX-toolboxStart.x, dy=event.clientY-toolboxStart.y; if (Math.abs(dx)+Math.abs(dy)>5) { toolboxMoved=true; toolbox.style.right="auto"; toolbox.style.bottom="auto"; toolbox.style.left=`${Math.max(8,Math.min(window.innerWidth-toolbox.offsetWidth-8,toolboxStart.left+dx))}px`; toolbox.style.top=`${Math.max(8,Math.min(window.innerHeight-toolbox.offsetWidth-8,toolboxStart.top+dy))}px`; } });
  toolboxLauncher?.addEventListener('pointerup', event => { if (!toolboxStart) return; toolboxLauncher.releasePointerCapture(event.pointerId); toolboxStart=null; });
  toolboxLauncher?.addEventListener('pointercancel', () => { toolboxStart=null; toolboxMoved=false; });
  toolboxLauncher?.addEventListener('click', () => { if (toolboxMoved) { toolboxMoved=false; return; } setToolboxOpen(!toolbox.classList.contains('is-open')); });
  toolbox?.addEventListener('keydown', event => { if (event.key === 'Escape') { setToolboxOpen(false); toolboxLauncher.focus(); } });
  toolbox?.addEventListener('click', event => { const action=event.target.closest('[data-toolbox-action]')?.dataset.toolboxAction; if (!action) return; const target={email:'emailNote',escalate:'escalateNote',copy:'copyNote'}[action]; if (!$(target).disabled) $(target).click(); setToolboxOpen(false); });
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
  // Other pages' Settings menus link here (case-notes.html#backup-restore or #customize-fields).
  function openSettingsFromLink() {
    const target = {"#backup-restore":"openBackupRestore","#customize-fields":"customizeFields"}[window.location?.hash];
    if (!target) return;
    // window.history: this file defines its own history() for the case list.
    try { window.history.replaceState(null, "", window.location.pathname + window.location.search); } catch {}
    $(target)?.click();
  }
  async function acquire() {
    load(); render();
    if (!navigator.locks) {
      if (loadFailed) return;
      $("lockNotice").textContent = "Read-only: this browser cannot protect notes against simultaneous editing. Open this site over HTTPS or localhost in a browser supporting Web Locks.";
      return;
    }
    if (!loadFailed) {
      $("lockNotice").hidden = false;
      $("lockNotice").textContent = "Read-only while another tab is editing Case Notes. Close that tab to edit here.";
    }
    try {
      await navigator.locks.request("dell-support.case-notes.editor", { ifAvailable: true }, async lock => {
        if (lock === null) {
          $("lockNotice").hidden = false;
          $("lockNotice").textContent = "Read-only while another tab is editing Case Notes. Close that tab to edit here.";
          return;
        }
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
        openSettingsFromLink();
        await new Promise(resolve => { release = resolve; });
      });
    } catch {
      $("lockNotice").textContent = "Unable to acquire the editor lock. Reload to try again.";
    }
  }
  window.addEventListener("pageshow", event => { if (event.persisted) acquire(); });
  window.CaseMarkdown?.init({
    current: selected,
    canEdit: canEditEntry,
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
