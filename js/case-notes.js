"use strict";
(() => {
  const key = "dell-support.case-notes.v1";
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value).replace(/[&<>"']/g,char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  let state = CaseNotes.empty(), dirty = false, writable = false, copying = false, release;
  let savedState = null;
  let summaryCaseId = null;
  let notesPopout, devinIntegration;
  let backupBusy = false, lastBackupSignature = "", lastSettingsSignature = "", lastBackupAt = null, lastDatedBackupAt = null;
  const backupTimeKey = "dell-support.last-backup-at", datedBackupKey = "dell-support.last-dated-backup-at", settingsSignatureKey = "dell-support.last-settings-signature";
  const retentionKey = "dell-support.backup-retention-days", cleanupEnabledKey = "dell-support.backup-cleanup-enabled", warningSnoozeKey = "dell-support.backup-warning-snoozed-until";
  try { lastBackupAt = localStorage.getItem(backupTimeKey); lastDatedBackupAt = localStorage.getItem(datedBackupKey); lastSettingsSignature = localStorage.getItem(settingsSignatureKey) || ""; } catch {}
  // Keep the case actions available at the top of the workspace while scrolling.
  const actionDock = document.getElementById("copyActions");
  const caseWorkArea = $("caseWorkArea");
  if (caseWorkArea?.prepend && actionDock) caseWorkArea.prepend(actionDock);
  const buttonTooltips = {
    newNote: "Start a new case with its first dated note and begin time tracking.",
    loadExampleNote: "Load a sample case note you can safely explore.",
    openTraining: "Tutorial Demo and Load Example.",
    openSettingsMenu: "Settings: customize case fields and manage backups.",
    openBackupRestore: "Back up, restore, and clean up case history and site configuration.",
    openToolsMenu: "Tools hub and support tool catalogs.",
    tutorialDemo: "See a guided tour of Case Notes and the toolbox.",
    customizeFields: "Choose which case fields appear and their order.",
    toggleHistory: "Show or hide the list of saved case notes.",
    backupHistory: "Save a backup of all case history and customer configuration.",
    chooseBackupFolder: "Choose a OneDrive-synced Documents folder for ProSupportToolsBackup.",
    restoreSettings: "Restore saved settings from your backup folder or a chosen file.",
    downloadSettings: "Save site configuration (fields, templates, toolbox, and preferences) to your configured backup folder, or download it if no folder is connected.",
    restoreHistory: "Restore case notes from a snapshot in your backup folder or from a file.",
    cleanupBackups: "Remove older automatic snapshots according to the retention setting. Manual backups and safety copies are kept.",
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
  const backupFolderButton = $("chooseBackupFolder");
  const restoreSettingsButton = $("restoreSettings");
  const backupFolderStatus = $("backupFolderStatus");
  const backupFolderDbName = "dell-support.case-notes.backup-folder";
  let backupFolderHandle = null;
  const supportsBackupFolder = () => typeof window.showDirectoryPicker === "function" && typeof indexedDB !== "undefined";
  function setBackupFolderStatus(message) {
    if (backupFolderStatus) backupFolderStatus.textContent = message;
    void refreshBackupFolderButton();
  }
  async function refreshBackupFolderButton() {
    if (!backupFolderButton) return;
    let connected = false;
    try { connected = !!backupFolderHandle && await backupFolderHandle.queryPermission({mode:"readwrite"}) === "granted"; } catch {}
    backupFolderButton.textContent = !backupFolderHandle ? "Set Backup Folder" : connected ? "Change Backup Folder" : "Reconnect Backup Folder";
    backupFolderButton.title = connected ? "Choose a different backup location." : backupFolderHandle ? "Approve access to your saved backup folder." : "Choose a OneDrive-synced Documents folder for ProSupportToolsBackup.";
  }
  function backupFolderStore(mode, callback) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(backupFolderDbName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("folders");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const transaction = request.result.transaction("folders", mode);
        const store = transaction.objectStore("folders");
        const result = callback(store);
        transaction.oncomplete = () => { request.result.close(); resolve(result?.result); };
        transaction.onabort = transaction.onerror = () => { request.result.close(); reject(transaction.error); };
      };
    });
  }
  async function restoreBackupFolder() {
    if (!supportsBackupFolder()) return;
    try {
      backupFolderHandle = await backupFolderStore("readonly", store => store.get("pros-support-tools"));
      if (backupFolderHandle) {
        const permission = await backupFolderHandle.queryPermission({mode:"readwrite"});
        setBackupFolderStatus(permission === "granted" ? "Automatic backups enabled while Case Notes is open. " + backupTimeLabel() : "Backup folder needs permission. Select Reconnect Backup Folder to resume. " + backupTimeLabel());
      }
    } catch { backupFolderHandle = null; }
  }
  async function storeBackupFolder(handle) {
    await backupFolderStore("readwrite", store => store.put(handle, "pros-support-tools"));
  }
  async function ensureBackupFolderPermission() {
    if (!backupFolderHandle) return false;
    const options = { mode: "readwrite" };
    if (await backupFolderHandle.queryPermission(options) === "granted") return true;
    return (await backupFolderHandle.requestPermission(options)) === "granted";
  }
  async function chooseBackupFolder() {
    if (!supportsBackupFolder()) {
      setBackupFolderStatus("This browser cannot store directly in a selected folder. Use Chrome or Edge, or download a backup manually.");
      return false;
    }
    try {
      const selectedFolder = await window.showDirectoryPicker({ id: "pro-support-tools-backups", mode: "readwrite" });
      backupFolderHandle = selectedFolder.name === "ProSupportToolsBackup" ? selectedFolder : await selectedFolder.getDirectoryHandle("ProSupportToolsBackup", { create:true });
      await storeBackupFolder(backupFolderHandle);
      lastBackupSignature = ""; lastSettingsSignature = ""; lastDatedBackupAt = null;
      setBackupFolderStatus("Backup folder ready. The latest snapshot is refreshed every minute while Case Notes is open and changes are present. Use Backup Case History to save now.");
      hideBackupWarning(); void refreshBackupSummary();
      return true;
    } catch (error) {
      if (error?.name !== "AbortError") setBackupFolderStatus("Backup folder was not set. You can still download a backup manually.");
      return false;
    }
  }
  function backupTimeLabel() { return lastBackupAt ? "Last successful backup: " + new Date(lastBackupAt).toLocaleString() + "." : "No successful folder backup yet."; }
  function settingsSnapshot() {
    const storedJson = (storageKey, fallback) => {
      try { return JSON.parse(localStorage.getItem(storageKey) || JSON.stringify(fallback)); } catch { return fallback; }
    };
    return JSON.stringify({
      exportedAt:new Date().toISOString(),
      fieldConfig:state.fieldConfig,
      toolbox:{
        shortcuts:storedJson("dell-support.toolbox-links.v1", []),
        appearance:storedJson("dell-support.toolbox-appearance.v1", { order:[], colors:{} })
      },
      preferences:capturePreferences()
    }, null, 2);
  }
  let skippedPreferences = [];
  function capturePreferences() { const preferences = CaseSettings.capture(localStorage); skippedPreferences = preferences.skipped; return preferences; }
  const skippedNotice = () => skippedPreferences.length ? ` Damaged saved setting${skippedPreferences.length > 1 ? "s" : ""} left out of the backup: ${skippedPreferences.join(", ")}. Re-save ${skippedPreferences.length > 1 ? "them" : "it"} in Settings.` : "";
  const settingsSignatureOf = config => { const parsed = JSON.parse(config); delete parsed.exportedAt; return JSON.stringify(parsed); };
  const retentionSetting = () => { try { return localStorage.getItem(retentionKey) ?? CaseBackup.DEFAULT_RETENTION; } catch { return CaseBackup.DEFAULT_RETENTION; } };
  const cleanupEnabled = () => { try { return localStorage.getItem(cleanupEnabledKey) === "true"; } catch { return false; } };
  function retentionLabel() { const days = CaseBackup.retentionDays(retentionSetting()); return days === null ? "Keeping every snapshot." : `Keeping ${days} days of snapshots.`; }
  // Folder writes run one at a time so a manual or safety backup never races the automatic one.
  let backupQueue = Promise.resolve();
  function queueBackup(task) { const run = backupQueue.then(task, task); backupQueue = run.catch(() => {}); return run; }
  async function writeFile(folder, name, content) {
    const writer = await (await folder.getFileHandle(name, { create:true })).createWritable();
    try { await writer.write(content); await writer.close(); }
    catch (error) { try { await writer.abort(); } catch {} throw error; }
  }
  async function readFolderFile(folder, name) { return (await folder.getFileHandle(name)).getFile(); }
  const imageName = path => path.slice(CaseBackup.IMAGES_DIR.length + 1);
  // Screenshots are content-addressed, so a file that already exists never needs rewriting.
  async function writeImageFiles(files) {
    if (!files.size) return;
    const dir = await backupFolderHandle.getDirectoryHandle(CaseBackup.IMAGES_DIR, { create:true });
    for (const [path, dataUrl] of files) {
      try { await dir.getFileHandle(imageName(path)); continue; } catch (error) { if (error?.name !== "NotFoundError") throw error; }
      await writeFile(dir, imageName(path), CaseBackup.dataUrlToBytes(dataUrl));
    }
  }
  async function loadImageFromFolder(path) {
    let file;
    try { file = await readFolderFile(await backupFolderHandle.getDirectoryHandle(CaseBackup.IMAGES_DIR), imageName(path)); }
    catch (error) { if (error?.name === "NotFoundError") return null; throw error; }
    return CaseBackup.bytesToDataUrl(new Uint8Array(await file.arrayBuffer()), path);
  }
  async function listFolderFiles(folder) {
    const files = [];
    if (!folder || typeof folder.entries !== "function") return files;
    for await (const [name, handle] of folder.entries()) {
      if (handle?.kind !== "file") continue;
      let size = 0, modified = 0;
      try { const file = await handle.getFile(); size = file.size || 0; modified = file.lastModified || 0; } catch {}
      files.push({ name, size, modified });
    }
    return files;
  }
  async function listImageFiles() {
    try { return await listFolderFiles(await backupFolderHandle.getDirectoryHandle(CaseBackup.IMAGES_DIR)); } catch { return []; }
  }
  // Writes screenshots, the latest history file, a dated snapshot when due, and settings. kind: auto | manual | safety.
  // Automatic runs keep one dated snapshot per hour; manual and safety runs always add one.
  function writeHistoryBackup({ kind, reason = null, automatic = false, text = null }) {
    if (!backupFolderHandle) return Promise.resolve(false);
    if (automatic && backupBusy) return Promise.resolve(false);
    return queueBackup(async () => {
      backupBusy = true;
      try {
        if (automatic) {
          if (await backupFolderHandle.queryPermission({mode:"readwrite"}) !== "granted") {
            setBackupFolderStatus("Automatic backup paused: select Reconnect Backup Folder to approve access. " + backupTimeLabel());
            return false;
          }
        } else if (!await ensureBackupFolderPermission()) return false;
        const now = Date.now();
        const { state: external, files } = await CaseBackup.externalizeImages(JSON.parse(text || CaseNotes.backup(state, now)));
        const history = JSON.stringify(external, null, 2);
        await writeImageFiles(files);
        const datedDue = kind !== "auto" || !lastDatedBackupAt || now - new Date(lastDatedBackupAt).getTime() >= CaseBackup.HOUR;
        if (datedDue) await writeFile(backupFolderHandle, CaseBackup.fileName("history", kind, now, reason), history);
        // Record the hourly snapshot as soon as it exists, so a later failure cannot cause one every minute.
        if (kind === "auto" && datedDue) { lastDatedBackupAt = new Date(now).toISOString(); try { localStorage.setItem(datedBackupKey, lastDatedBackupAt); } catch {} }
        await writeFile(backupFolderHandle, CaseBackup.LATEST_HISTORY, history);
        lastBackupAt = new Date(now).toISOString();
        try { localStorage.setItem(backupTimeKey, lastBackupAt); } catch {}
        // Case history is safe at this point; a settings failure is reported on its own.
        let settingsSaved = true;
        try {
          const config = settingsSnapshot(), signature = settingsSignatureOf(config);
          if (signature !== lastSettingsSignature) {
            await writeFile(backupFolderHandle, CaseBackup.fileName("settings", "auto", now), config);
            lastSettingsSignature = signature; try { localStorage.setItem(settingsSignatureKey, signature); } catch {}
          }
          await writeFile(backupFolderHandle, CaseBackup.LATEST_SETTINGS, config);
        } catch { settingsSaved = false; }
        setBackupFolderStatus((kind === "safety" ? `Safety copy saved before ${reason.replace(/-/g, " ")}. ` : "Automatic backups enabled. ") + (settingsSaved ? "" : "Case history was saved, but site configuration could not be written; it will be retried. ") + backupTimeLabel() + skippedNotice());
        if (kind === "auto" && datedDue) scheduleCleanup();
        return true;
      } finally { backupBusy = false; }
    });
  }
  async function automaticBackup() {
    if (!writable || loadFailed || copying || backupBusy || !backupFolderHandle) return;
    // Back up even when the browser save fails: the folder copy may then be the only copy of recent edits.
    save();
    try {
      const signature = JSON.stringify([state, settingsSignatureOf(settingsSnapshot())]);
      if (signature === lastBackupSignature) return;
      if (await writeHistoryBackup({ kind:"auto", automatic:true })) lastBackupSignature = signature;
    } catch { setBackupFolderStatus("Automatic backup failed. Check folder access and available disk space. " + backupTimeLabel()); }
  }
  // Snapshot the current history before an action that cannot be undone. Skipped silently without a folder.
  async function safetySnapshot(reason) {
    if (!backupFolderHandle || loadFailed) return false;
    const text = CaseNotes.backup(state, Date.now());
    try { return await writeHistoryBackup({ kind:"safety", reason, text }); } catch { return false; }
  }
  // Before an action that cannot be undone: true when it is safe to continue. Without a folder there is nothing to try.
  async function confirmSafetySnapshot(reason) {
    if (!backupFolderHandle || loadFailed) return true;
    if (await safetySnapshot(reason)) return true;
    return confirm("The safety copy could not be saved to the backup folder. Check folder access and disk space. Continue anyway without a safety copy?");
  }
  async function cleanupPlan() {
    const files = await listFolderFiles(backupFolderHandle);
    return { files, ...CaseBackup.retentionPlan(files, { now: Date.now(), days: CaseBackup.retentionDays(retentionSetting()) }) };
  }
  // Delete screenshot files no remaining snapshot references. Any unreadable snapshot aborts the sweep.
  async function removeUnreferencedImages(keptNames) {
    const images = await listImageFiles();
    if (!images.length) return 0;
    const refs = new Set();
    for (const name of keptNames) {
      const info = CaseBackup.parseFileName(name);
      if (!info || info.type !== "history" || info.legacy) continue;
      try { for (const ref of CaseBackup.imageReferences(JSON.parse(await (await readFolderFile(backupFolderHandle, name)).text()))) refs.add(ref); }
      catch { return 0; }
    }
    const dir = await backupFolderHandle.getDirectoryHandle(CaseBackup.IMAGES_DIR);
    let removed = 0;
    for (const image of images) {
      const path = CaseBackup.IMAGES_DIR + "/" + image.name;
      if (!CaseBackup.isImagePath(path) || refs.has(path)) continue;
      await dir.removeEntry(image.name); removed++;
    }
    return removed;
  }
  function cleanupBackups({ automatic = false } = {}) {
    if (!backupFolderHandle) return Promise.resolve(null);
    return queueBackup(async () => {
      backupBusy = true;
      try {
        if (automatic ? await backupFolderHandle.queryPermission({mode:"readwrite"}) !== "granted" : !await ensureBackupFolderPermission()) return null;
        const plan = await cleanupPlan();
        for (const file of plan.remove) await backupFolderHandle.removeEntry(file.name);
        const images = plan.remove.length ? await removeUnreferencedImages(plan.keep) : 0;
        return { ...plan, images };
      } finally { backupBusy = false; }
    });
  }
  // Runs after each hourly snapshot. Until the user enables cleanup once, it only reports what could be removed.
  function scheduleCleanup() {
    if (CaseBackup.retentionDays(retentionSetting()) === null) return;
    if (!cleanupEnabled()) {
      void queueBackup(cleanupPlan).then(plan => {
        if (plan.remove.length) setBackupFolderStatus(`${plan.remove.length} older snapshot${plan.remove.length === 1 ? "" : "s"} (${CaseBackup.formatBytes(plan.removedBytes)}) can be removed. Open Backup & Restore and choose Clean Up Old Snapshots to turn on automatic cleanup. ` + backupTimeLabel());
      }).catch(() => {});
      return;
    }
    void cleanupBackups({ automatic:true }).then(result => {
      if (result?.remove.length) setBackupFolderStatus(`Cleanup removed ${result.remove.length} older snapshot${result.remove.length === 1 ? "" : "s"} (${CaseBackup.formatBytes(result.removedBytes)}). ${retentionLabel()} ` + backupTimeLabel());
      void refreshBackupSummary();
    }).catch(() => {});
  }
  async function refreshBackupSummary() {
    const summary = $("backupSummary");
    if (!summary) return;
    if (!backupFolderHandle) { summary.textContent = (supportsBackupFolder() ? "No backup folder connected. Backups download to this device. " : "This browser cannot connect a backup folder. Backups download to this device. ") + dataLossWarning; return; }
    try {
      if (await backupFolderHandle.queryPermission({mode:"readwrite"}) !== "granted") { summary.textContent = "Backup folder needs permission. " + backupTimeLabel(); return; }
      const files = await listFolderFiles(backupFolderHandle), images = await listImageFiles();
      const totals = CaseBackup.summarize(files);
      const bytes = totals.bytes + images.reduce((sum, file) => sum + file.size, 0);
      summary.textContent = `${totals.snapshots} snapshot${totals.snapshots === 1 ? "" : "s"} · ${CaseBackup.formatBytes(bytes)} · ${retentionLabel()}`;
    } catch { summary.textContent = "Backup folder could not be read. " + backupTimeLabel(); }
  }
  const retentionSelect = $("backupRetention");
  if (retentionSelect) {
    retentionSelect.value = retentionSetting();
    retentionSelect.addEventListener("change", () => {
      if (!Object.hasOwn(CaseBackup.RETENTION_OPTIONS, retentionSelect.value)) return;
      try { localStorage.setItem(retentionKey, retentionSelect.value); localStorage.setItem(cleanupEnabledKey, "true"); } catch {}
      setBackupFolderStatus(retentionLabel() + (CaseBackup.retentionDays(retentionSelect.value) === null ? "" : " Automatic cleanup runs after each hourly snapshot."));
      void refreshBackupSummary();
    });
  }
  $("cleanupBackups")?.addEventListener("click", async () => {
    if (!backupFolderHandle) { setBackupFolderStatus("Set a backup folder before cleaning up snapshots."); return; }
    try {
      if (!await ensureBackupFolderPermission()) { setBackupFolderStatus("Folder access was not approved. Nothing was removed."); return; }
      const days = CaseBackup.retentionDays(retentionSetting());
      if (days === null) { setBackupFolderStatus("Retention is set to keep every snapshot. Choose a retention period to enable cleanup."); return; }
      const plan = await queueBackup(cleanupPlan);
      if (!plan.remove.length) { try { localStorage.setItem(cleanupEnabledKey, "true"); } catch {} setBackupFolderStatus("Nothing to clean up. " + retentionLabel() + " Automatic cleanup runs after each hourly snapshot."); await refreshBackupSummary(); return; }
      const tiers = `every snapshot from the last 24 hours, one per day for ${Math.min(days, 30)} days${days > 30 ? `, then one per week for ${days} days` : ""}`;
      if (!confirm(`Remove ${plan.remove.length} older automatic snapshot${plan.remove.length === 1 ? "" : "s"} (${CaseBackup.formatBytes(plan.removedBytes)})? Kept: ${tiers}, plus all manual backups and safety copies. OneDrive keeps removed files in its recycle bin. Automatic cleanup then runs after each hourly snapshot.`)) return;
      try { localStorage.setItem(cleanupEnabledKey, "true"); } catch {}
      const result = await cleanupBackups();
      if (!result) { setBackupFolderStatus("Folder access was not approved. Nothing was removed."); return; }
      setBackupFolderStatus(`Removed ${result.remove.length} snapshot${result.remove.length === 1 ? "" : "s"} and ${result.images} unused screenshot file${result.images === 1 ? "" : "s"}. ${retentionLabel()}`);
      await refreshBackupSummary();
    } catch { setBackupFolderStatus("Cleanup did not finish. Check folder access and try again. Nothing else was changed."); }
  });
  const reportSettings = message => { report(message, "backupFolderStatus"); void refreshBackupFolderButton(); };
  async function restoreSettings(importedConfig = null) {
    if (!writable || copying || !save()) return;
    if (!backupFolderHandle && !importedConfig) {
      reportSettings("Set the backup folder first, then restore customer-config.json from ProSupportToolsBackup.");
      return;
    }
    try {
      let config = importedConfig;
      if (!config) {
        if (!await ensureBackupFolderPermission()) throw Error("Folder access was not approved.");
        const file = await (await backupFolderHandle.getFileHandle("customer-config.json")).getFile();
        config = JSON.parse(await file.text());
      }
      const settings = CaseSettings.validate(config, CaseNotes.fields);
      for (const id of Object.keys(settings.fieldConfig.customFields)) {
        if (document.getElementById(id) && !Object.hasOwn(state.fieldConfig.customFields,id)) throw Error("A custom field ID conflicts with a page control: " + id);
      }
      if (!writable || copying || !confirm("Restore the saved fields, toolbox, AI prompts, and interface preferences? Current settings will be replaced; case notes are kept.")) return;
      const candidate = CaseNotes.parse(JSON.stringify({...state,fieldConfig:settings.fieldConfig}));
      CaseSettings.commit(localStorage,{...settings.values,[key]:JSON.stringify(candidate)});
      state = candidate; savedState = JSON.parse(JSON.stringify(state)); dirty = false;
      window.dispatchEvent(new Event("prosSupportToolboxRestore"));
      window.dispatchEvent(new Event("supportSettingsRestored"));
      actionDockFloating = localStorage.getItem(actionDockPreferenceKey) !== "false"; updateActionDockMode();
      historyCollapsed = localStorage.getItem(sidebarKey) === "true"; setHistoryCollapsed(historyCollapsed);
      sectionState = JSON.parse(localStorage.getItem(sectionsKey) || "{}");
      sectionIds.forEach(id => setSectionCollapsed(id,!!sectionState[id]));
      aiTasks.loadAiTasks(); render();
      if (retentionSelect) retentionSelect.value = retentionSetting();
      reportSettings("Settings restored successfully. Case notes were kept.");
    } catch (error) {
      reportSettings(error?.message || "Could not restore settings. Confirm customer-config.json exists in ProSupportToolsBackup.");
    }
  }
  // Backup & Restore lives under the Settings gear and opens as a dialog that stays open while its actions report status.
  function setBackupMenu(open, focusFirst = false) {
    const menu = $("backupRestoreMenu");
    if (!menu) return;
    if (open) {
      if (!menu.open) menu.showModal();
      void refreshBackupFolderButton(); void refreshBackupSummary();
      if (focusFirst) [...menu.querySelectorAll("button")].find(item => !item.disabled)?.focus();
    } else if (menu.open) menu.close();
  }
  $("openBackupRestore")?.addEventListener("click", async () => {
    window.SiteTopbar?.closeMenus();
    setBackupMenu(true, true);
    await refreshBackupFolderButton();
  });
  $("closeBackupRestore")?.addEventListener("click", () => setBackupMenu(false));
  backupFolderButton?.addEventListener("click", async () => {
    try {
      if (!backupFolderHandle || await backupFolderHandle.queryPermission({mode:"readwrite"}) === "granted") {
        await chooseBackupFolder();
      } else if (await ensureBackupFolderPermission()) {
        setBackupFolderStatus("Folder connected. " + backupTimeLabel());
        await automaticBackup();
      } else {
        setBackupFolderStatus("Folder access was not approved. " + backupTimeLabel());
      }
    } catch {
      setBackupFolderStatus("Could not reconnect. Choose your backup folder again.");
      await chooseBackupFolder();
    }
    await refreshBackupFolderButton();
  });
  restoreSettingsButton?.addEventListener("click", () => {
    if (!writable || copying) return;
    setBackupMenu(false);
    $("restoreSettingsFromFolder").disabled = !backupFolderHandle;
    $("restoreSettingsFolderHint").textContent = backupFolderHandle
      ? "From backup folder reads the latest customer-config.json. Choose a file to use an older backup or a file from another computer."
      : "No backup folder connected. Use Set Backup Folder first, or choose a settings backup file now.";
    $("restoreSettingsDialog").showModal();
  });
  $("cancelRestoreSettings")?.addEventListener("click", () => $("restoreSettingsDialog").close());
  $("restoreSettingsFromFolder")?.addEventListener("click", () => {
    if (!writable || copying || !backupFolderHandle) return;
    $("restoreSettingsDialog").close();
    return restoreSettings();
  });
  $("restoreSettingsFromFile")?.addEventListener("click", () => {
    if (!writable || copying) return;
    $("restoreSettingsDialog").close();
    $("settingsFile").click();
  });
  $("downloadSettings")?.addEventListener("click", async () => {
    if (backupBusy) {
      setBackupFolderStatus("A backup is already in progress. Try Backup Site Configuration again when it finishes.");
      return;
    }
    // Queued with the other folder writes so an automatic backup cannot run at the same time.
    await queueBackup(async () => {
      const folder = backupFolderHandle;
      backupBusy = true;
      try {
        if (folder && !await ensureBackupFolderPermission()) {
          setBackupFolderStatus("Settings were not exported: folder access was not approved. Reconnect Backup Folder and try again.");
          return;
        }
        const config = settingsSnapshot();
        if (!folder) {
          downloadFile(config,"customer-config.json","application/json");
          setBackupFolderStatus("No backup folder connected. Settings download started. Use Set Backup Folder to save future exports directly there.");
          return;
        }
        const datedName = CaseBackup.fileName("settings", "manual", Date.now());
        for (const name of [datedName, CaseBackup.LATEST_SETTINGS]) await writeFile(folder, name, config);
        lastSettingsSignature = settingsSignatureOf(config); try { localStorage.setItem(settingsSignatureKey, lastSettingsSignature); } catch {}
        setBackupFolderStatus("Settings saved to ProSupportToolsBackup/customer-config.json, with a dated settings copy. Case-note backups were not changed.");
      } catch {
        setBackupFolderStatus(folder
          ? "Settings backup did not finish. Check backup folder access and available disk space, then try again."
          : "Settings backup failed. Check browser storage and download access.");
      } finally { backupBusy = false; }
    });
  });
  $("settingsFile")?.addEventListener("change", async () => {
    const file = $("settingsFile").files[0]; $("settingsFile").value = "";
    if (!file) return;
    if (file.size > maxSettingsBytes) { reportSettings("That file is too large to be a customer-config.json settings backup."); return; }
    try { await restoreSettings(JSON.parse(await file.text())); }
    catch { reportSettings("Choose a valid customer-config.json settings backup."); }
  });
  const warningBanner = $("backupWarningBanner");
  const dataLossWarning = "If you reset your browser or delete browser data, all of this app's settings and notes history will be lost.";
  function hideBackupWarning() { if (warningBanner) warningBanner.hidden = true; }
  // When a saved folder only needs re-approval, ask on the user's next click instead of making them find Reconnect.
  let permissionClickArmed = false;
  function armPermissionOnFirstClick() {
    if (permissionClickArmed) return;
    permissionClickArmed = true;
    document.addEventListener?.("click", async event => {
      if (!permissionClickArmed || !backupFolderHandle) return;
      if (event?.target && $("backupRestoreMenu")?.contains?.(event.target)) return;
      permissionClickArmed = false;
      try {
        if (await backupFolderHandle.queryPermission({mode:"readwrite"}) === "granted") return;
        if (await backupFolderHandle.requestPermission({mode:"readwrite"}) === "granted") {
          hideBackupWarning();
          setBackupFolderStatus("Backup folder reconnected. " + backupTimeLabel());
          await automaticBackup();
        }
      } catch {}
      await refreshBackupFolderButton();
    });
  }
  async function warnIfBackupsUnavailable() {
    let connected = false;
    try { connected = !!backupFolderHandle && await backupFolderHandle.queryPermission({mode:"readwrite"}) === "granted"; } catch {}
    if (connected) { hideBackupWarning(); return; }
    if (backupFolderHandle) armPermissionOnFirstClick();
    let snoozedUntil = 0;
    try { snoozedUntil = Number(localStorage.getItem(warningSnoozeKey)) || 0; } catch {}
    if (snoozedUntil > Date.now()) return;
    $("backupWarningMessage").textContent = backupFolderHandle
      ? "Automatic backups are paused because your saved backup folder needs permission. Your next click on this page asks the browser for access, or open Configure Backups and select Reconnect Backup Folder. Until then, if you reset your browser or delete browser data, changes since your last backup will be lost."
      : supportsBackupFolder()
        ? "Automatic backups are not configured. Choose a backup folder to protect your case notes and site settings. " + dataLossWarning
        : "Automatic backups are not configured. This browser cannot save directly to a backup folder. Use Chrome or Edge for folder backups, or open Configure Backups to download manual backups. " + dataLossWarning;
    if (warningBanner) warningBanner.hidden = false;
  }
  // Snoozing needs a second, explicit step so the data-loss risk is acknowledged.
  const snoozeDialog = $("backupSnoozeDialog");
  function openBackupSettings() {
    hideBackupWarning();
    window.scrollTo?.(0, 0);
    setBackupMenu(true, true);
  }
  $("dismissBackupWarning")?.addEventListener("click", () => {
    if (!snoozeDialog) return;
    if (!snoozeDialog.open) snoozeDialog.showModal();
    $("confirmBackupSnooze")?.focus();
  });
  $("confirmBackupSnooze")?.addEventListener("click", () => {
    snoozeDialog?.close();
    hideBackupWarning();
    try { localStorage.setItem(warningSnoozeKey, String(Date.now() + 7 * CaseBackup.DAY)); } catch {}
  });
  $("snoozeConfigureBackups")?.addEventListener("click", () => {
    snoozeDialog?.close();
    openBackupSettings();
  });
  $("cancelBackupSnooze")?.addEventListener("click", () => snoozeDialog?.close());
  $("configureBackups")?.addEventListener("click", openBackupSettings);
  // Check once per page visit, after the saved folder has been loaded.
  restoreBackupFolder().then(warnIfBackupsUnavailable);
  setInterval(automaticBackup,60000);
  const actionDockPreferenceKey = "dell-support.case-notes.action-dock-floating";
  const actionDockToggle = $("toggleActionDock");
  let actionDockFloating = true;
  try { actionDockFloating = localStorage.getItem(actionDockPreferenceKey) !== "false"; } catch { /* Keep floating as the default. */ }
  const rightRailQuery = window.matchMedia?.("(min-width: 1500px) and (min-height: 780px)");
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
      if (text.length > storageWarningChars) status(`Saved · Browser storage is ${Math.round(text.length / 50000)}% full. Delete cases from Trash or remove screenshots you no longer need, and keep backups current.`, false, true);
      else status("Saved · " + new Date().toLocaleTimeString());
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
      $("lockNotice").textContent = "Case history could not be read. Editing is disabled to protect stored notes. Reload to try again. If it still fails, download the stored data to keep a copy, then restore your latest backup file.";
      $("recoveryActions").hidden = false;
    }
  }
  $("downloadStoredData")?.addEventListener("click", () => {
    let raw = null;
    try { raw = localStorage.getItem(key); } catch {}
    if (raw === null) { report("Browser storage could not be read, so there is nothing to download. Check that site data is allowed for this page."); return; }
    downloadFile(raw, "case-notes-stored-data-" + new Date().toISOString().slice(0, 10) + ".json", "application/json");
    report("Stored data download started. Keep this file: it holds your notes exactly as the browser stored them.");
  });
  $("recoverFromFile")?.addEventListener("click", () => { if (canRestore()) $("restoreFile").click(); });
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
        if (!save()) return;
        if (collection === "trash" && !await confirmSafetySnapshot("delete")) return;
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
    ["restoreSettings","restoreSettingsFromFile","restoreSettingsFromFolder"].forEach(id => { if ($(id)) $(id).disabled = !writable || copying || (id === "restoreSettingsFromFolder" && !backupFolderHandle); });
    ["caseVersions","printCase"].forEach(id => { if ($(id)) $(id).disabled = !selected() || copying; });
    $("backupHistory").disabled = loadFailed || copying;
    ["restoreHistory","restoreHistoryFromFile","restoreHistoryFromFolder"].forEach(id => { if ($(id)) $(id).disabled = !writable || copying || (id === "restoreHistoryFromFolder" && !backupFolderHandle); });
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
  $("backupHistory").addEventListener("click", async () => {
    if (loadFailed || copying) return;
    try {
      if (backupFolderHandle && await writeHistoryBackup({ kind:"manual" })) {
        $("backupStatus").textContent = `Backup saved to ProSupportToolsBackup: ${state.cases.length} cases, screenshots, and customer configuration. Manual backups are never cleaned up automatically.`;
        void refreshBackupSummary();
        return;
      }
      downloadFile(CaseNotes.backup(state, Date.now()), CaseBackup.fileName("history", "manual", Date.now()), "application/json");
      $("backupStatus").textContent = `Backup download started: ${state.cases.length} cases, including unsaved edits. Set a backup folder to also save customer configuration in ProSupportToolsBackup.`;
    } catch {
      $("backupStatus").textContent = "Backup could not be created. Your history has not changed. Please try again.";
    }
  });
  $("restoreHistory").addEventListener("click", () => {
    if (!writable || copying) return;
    setBackupMenu(false);
    $("restoreHistoryFromFolder").disabled = !backupFolderHandle;
    $("restoreHistoryFolderHint").textContent = backupFolderHandle
      ? "From backup folder lists the snapshots in ProSupportToolsBackup, newest first. Choose a file to use a downloaded backup or one from another computer."
      : "No backup folder connected. Use Set Backup Folder first, or choose a history backup file now.";
    $("restoreHistoryDialog").showModal();
  });
  $("cancelRestoreHistory")?.addEventListener("click", () => $("restoreHistoryDialog").close());
  $("restoreHistoryFromFile")?.addEventListener("click", () => {
    if (!writable || copying) return;
    $("restoreHistoryDialog").close();
    $("restoreFile").click();
  });
  $("restoreHistoryFromFolder")?.addEventListener("click", async () => {
    if (!writable || copying || !backupFolderHandle) return;
    $("restoreHistoryDialog").close();
    await openBackupBrowser();
  });
  $("closeBackupBrowser")?.addEventListener("click", () => $("backupBrowserDialog").close());
  const snapshotKinds = { latest:"Latest", auto:"Hourly", manual:"Manual", safety:"Safety copy" };
  async function openBackupBrowser() {
    const list = $("backupBrowserList"), browserStatus = $("backupBrowserStatus");
    list.replaceChildren(); browserStatus.textContent = "Reading backup folder…";
    $("backupBrowserDialog").showModal();
    try {
      if (!await ensureBackupFolderPermission()) throw Error("Folder access was not approved.");
      const snapshots = (await listFolderFiles(backupFolderHandle))
        .map(file => ({ ...file, info: CaseBackup.parseFileName(file.name) }))
        .filter(file => file.info?.type === "history")
        .sort((a, b) => (b.info.time ?? Infinity) - (a.info.time ?? Infinity) || b.modified - a.modified);
      if (!snapshots.length) { browserStatus.textContent = "No history snapshots were found in ProSupportToolsBackup."; return; }
      for (const file of snapshots) {
        const button = document.createElement("button");
        button.type = "button"; button.className = "backup-entry"; button.dataset.name = file.name;
        const when = file.info.time ?? file.modified;
        const kind = snapshotKinds[file.info.kind] + (file.info.reason ? " before " + file.info.reason.replace(/-/g, " ") : "");
        button.textContent = `${when ? new Date(when).toLocaleString() : "Unknown time"} · ${kind} · ${CaseBackup.formatBytes(file.size)}`;
        button.addEventListener("click", () => restoreFromFolderFile(file.name));
        list.append(button);
      }
      browserStatus.textContent = `${snapshots.length} snapshot${snapshots.length === 1 ? "" : "s"}. Select one to review before restoring. A safety copy of your current history is saved first.`;
    } catch (error) { browserStatus.textContent = error?.message || "The backup folder could not be read."; }
  }
  async function restoreFromFolderFile(name) {
    $("backupBrowserDialog").close();
    try {
      const file = await readFolderFile(backupFolderHandle, name);
      if (file.size > maxImportBytes) throw Error("That snapshot is too large to restore.");
      await restoreHistoryText(await file.text());
    }
    catch (error) { report((error?.message || "The snapshot could not be read.") + " Choose another snapshot or a file. Current history was not changed."); }
  }
  // Backups with screenshots inline can be large, but anything past these limits cannot be a real export and would stall the tab.
  const maxImportBytes = 200 * 1024 * 1024, maxSettingsBytes = 5 * 1024 * 1024;
  // Shared by file uploads and folder snapshots. Screenshot references are resolved from the folder's images directory.
  // While stored history is unreadable this tab holds the editor lock but cannot edit; it may only restore.
  let recovering = false;
  const canRestore = () => (writable || recovering) && !copying;
  async function restoreHistoryText(raw) {
    if (!canRestore()) return;
    let restored;
    try {
      if (raw.trim() === "null") throw Error("Not a backup");
      let data = JSON.parse(raw);
      if (CaseBackup.hasExternalImages(data)) {
        if (!backupFolderHandle) {
          report("This backup keeps screenshots in the backup folder's images subfolder. Connect that backup folder, then use Restore History and choose From backup folder. Current history was not changed.");
          return;
        }
        if (!await ensureBackupFolderPermission()) throw Error("Folder access was not approved.");
        data = await CaseBackup.inlineImages(data, loadImageFromFolder);
      }
      restored = CaseNotes.parse(JSON.stringify(data));
      // A custom field renders as an input with its ID, so it must not take the ID of a page control.
      for (const id of Object.keys(restored.fieldConfig.customFields)) {
        if (!Object.hasOwn(state.fieldConfig.customFields,id) && document.getElementById(id)) throw Error("A custom field ID in this backup conflicts with a page control: " + id + ".");
      }
      // Backups freeze elapsed time; never count time spent in an archive.
      restored.cases.forEach(note => { note.started = null; });
    } catch (error) {
      report(/Screenshot file missing|Folder access|conflicts with a page control/.test(error?.message || "")
        ? error.message + " Current history was not changed."
        : "Invalid or unsupported backup. Choose a Case Notes JSON backup with at most 100 cases. Current history was not changed.");
      return;
    }
    const safety = backupFolderHandle ? "A safety copy of your current history is saved to the backup folder first." : "Download a backup first if you want to keep them.";
    if (!confirm(`Restore ${restored.cases.length} recent, ${restored.archive.length} archived and ${restored.trash.length} deleted cases, plus their versions? This replaces your current history, archive and Trash, including unsaved edits. ${safety} Restored timers will be stopped.`)) return;
    if (!await confirmSafetySnapshot("restore")) { report("Restore cancelled. Current history was not changed."); return; }
    if (!canRestore()) return;
    try {
      // Commit to storage before replacing in-memory notes, so failure is non-destructive.
      localStorage.setItem(key, JSON.stringify(restored));
    } catch {
      report("Restore could not be saved. Check available browser storage and try again. Current history was not changed.");
      return;
    }
    state = restored; savedState = JSON.parse(JSON.stringify(state)); dirty = false;
    if (recovering) { recovering = false; loadFailed = false; writable = true; $("lockNotice").hidden = true; $("recoveryActions").hidden = true; }
    $("search").value = "";
    status("Saved"); render();
    $("copyStatus").textContent = "";
    report(`Restored ${state.cases.length} cases. Timers are stopped; editing a case resumes tracking.`);
  }
  $("restoreFile").addEventListener("change", async () => {
    const file = $("restoreFile").files[0];
    $("restoreFile").value = "";
    if (!file || !canRestore()) return;
    if (file.size > maxImportBytes) { report("That file is too large to be a Case Notes backup. Current history was not changed."); return; }
    let raw;
    try { raw = await file.text(); } catch { report("The selected file could not be read. Current history was not changed."); return; }
    if (!canRestore()) return;
    await restoreHistoryText(raw);
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
      if (!confirm(`Remove ${names} and their values from recent cases, Archive, Trash, and saved versions? ${backupFolderHandle ? "A safety copy is saved to the backup folder first." : "Existing backup files are not changed."}`)) return;
      if (!save() || !await confirmSafetySnapshot("field-removal") || !writable || copying || fieldDraft !== draft) return;
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
    if (confirm(`Reset field order and remove custom fields and their values from recent cases, Archive, Trash, and saved versions? This cannot be undone. ${backupFolderHandle ? "A safety copy is saved to the backup folder first." : "Existing backup files are not changed."}`)) {
      if (!save() || !await confirmSafetySnapshot("field-reset") || !writable || copying) return;
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
      await navigator.locks.request("dell-support.case-notes.editor", async () => {
        load();
        if (loadFailed) {
          // Hold the lock so no other tab writes over the unreadable data, and allow only a restore.
          recovering = true; $("recoverFromFile").disabled = false;
          await new Promise(resolve => { release = resolve; });
          recovering = false;
          return;
        }
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
