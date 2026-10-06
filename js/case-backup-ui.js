"use strict";
// Backup & Restore dialogs and page wiring for Case Notes. The engine and file handling live in case-sync-core.js
// and case-backup-core.js; case-notes.js passes in the few page functions this needs (see init).
window.CaseBackupUI = (() => {
  // page: { key, state(), replaceState(next), writable(), copying(), render(), report(message, dialogStatus) }
  function init(page) {
    const $ = id => document.getElementById(id), key = page.key;
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
        fieldConfig: page.state().fieldConfig,
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
    function backupMessage(message) { page.report(message, "backupFolderStatus"); renderBackupState(); }
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
    // ---- backing up
    function runBackup(manual = false) {
      return queued(async () => {
        const root = await getRoot(manual);
        if (!root) { renderBackupState(); if (manual) throw Error("Reconnect the backup folder first."); return null; }
        try {
          const result = await CaseSync.backup(root, { state: page.state(), settingsJson: settingsSnapshot(), manual, retention: retentionSetting() });
          lastBackupRun = Date.now(); backupProblem = null; backedUpSettings = settingsFingerprint();
          await refreshSummary(root);
          return result;
        } catch (error) { backupProblem = friendlyError(error); renderBackupState(); throw error; }
      });
    }
    // A change is backed up a few seconds after saving, and at most every 30 seconds; the newest change is never skipped.
    function scheduleBackup() {
      if (!backupChosen || !page.writable() || awaitingChoice || backupTimer) return;
      backupTimer = setTimeout(() => { backupTimer = null; runBackup().catch(() => {}); }, Math.max(3000, 30000 - (Date.now() - lastBackupRun)));
    }
    // Toolbox, theme and other preferences live outside the case history, so a settings change must trigger a backup on its own.
    const settingsFingerprint = (text = settingsSnapshot()) => { try { const value = JSON.parse(text); delete value.exportedAt; return JSON.stringify(value); } catch { return ""; } };
    let backedUpSettings = null;
    setInterval(() => {
      if (!backupChosen || !page.writable() || awaitingChoice || backupTimer) return;
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
      const empty = !page.state().cases.length && !page.state().archive.length;
      const choice = await window.CaseDialogs.askChoice({
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
          const ok = await window.CaseDialogs.askChoice({ title: "Replace the folder's latest copy?", message: "The folder already holds backups. Backing up now replaces its latest copy with the notes in this browser. Older snapshots are kept.", buttons: [{ label: "Back up and replace latest", value: true, primary: true }, { label: "Cancel", value: false }] });
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
      // Settings copies identical to what is active now would change nothing, so say so instead of offering a no-op restore.
      const same = new Set();
      if (restoreKind === "settings") {
        const current = settingsFingerprint();
        for (const item of items) { try { if (settingsFingerprint(await CaseSync.loadSettingsText(root, item.name)) === current) same.add(item.name); } catch { /* unreadable copies still list */ } }
      }
      $("restoreStatus").textContent = items.length ? `${plural(items.length, "backup")} found. Newest first within each group.` : `No ${restoreKind === "history" ? "case history" : "settings"} backups yet. Select Back Up Now in Backup & Restore to create one.`;
      for (const [kind, title] of groupTitles) {
        const group = items.filter(item => item.kind === kind);
        if (!group.length) continue;
        const heading = document.createElement("p"); heading.className = "dropdown-label"; heading.textContent = title; list.append(heading);
        for (const item of group) list.append(restoreRow(item, same.has(item.name)));
      }
    }
    function restoreRow(item, matchesCurrent = false) {
      const row = document.createElement("div"); row.className = "backup-row"; row.setAttribute("role", "listitem");
      const when = friendlyTime(item.time);
      const text = document.createElement("div"); text.className = "backup-row-main";
      const strong = document.createElement("strong"); strong.textContent = when;
      const small = document.createElement("span"); small.textContent = `${describeKind(item)} · ${CaseBackup.formatBytes(item.size)}${matchesCurrent ? " · same as your current settings" : ""}`;
      text.append(strong, small);
      const restore = document.createElement("button"); restore.type = "button"; restore.className = "button primary"; restore.textContent = "Restore"; restore.setAttribute("aria-label", `Restore the backup from ${when}`);
      if (matchesCurrent) { restore.disabled = true; restore.title = "These settings are already active, so restoring would change nothing."; }
      restore.addEventListener("click", () => void restoreSnapshot(item, when));
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "button secondary"; remove.textContent = "Delete"; remove.setAttribute("aria-label", `Delete the backup from ${when}`);
      remove.addEventListener("click", () => void deleteSnapshot(item, when));
      row.append(text, restore, remove);
      return row;
    }
    async function deleteSnapshot(item, when) {
      const ok = await window.CaseDialogs.askChoice({ title: "Delete this backup?", message: `${describeKind(item)} from ${when} will be permanently deleted from the backup folder. Your current notes are not affected.${item.kind === "latest" ? " The most recent backup is recreated the next time your notes are backed up." : ""}`, buttons: [{ label: "Delete backup", value: true, primary: true }, { label: "Keep it", value: false }] });
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
      if (nextState) page.replaceState(nextState);
      if (restoredSettings && !nextState) {
        const next = CaseNotes.parse(JSON.stringify({ ...page.state(), fieldConfig: restoredSettings.fieldConfig }));
        localStorage.setItem(key, JSON.stringify(next));
        page.replaceState(next);
      }
      window.dispatchEvent(new Event("prosSupportToolboxRestore"));
      window.dispatchEvent(new Event("supportSettingsRestored"));
      page.render();
    }
    function checkSettings(text) {
      const restored = CaseSettings.validate(JSON.parse(text), CaseNotes.fields);
      for (const id of Object.keys(restored.fieldConfig.customFields)) {
        if (document.getElementById(id) && !Object.hasOwn(page.state().fieldConfig.customFields, id)) throw Error(`A custom field ID conflicts with a page control: ${id}`);
      }
      return restored;
    }
    // One path for folder snapshots and chosen files: validate, confirm, save a safety copy, then replace.
    async function restoreFlow({ kind, text, label }) {
      if (!page.writable() || page.copying()) { $("restoreStatus").textContent = "Another Case Notes window is editing right now. Close it, then try again."; return; }
      let history = null, settings = null;
      try {
        if (kind === "history") history = CaseNotes.parse(text); else settings = checkSettings(text);
      } catch (error) {
        $("restoreStatus").textContent = `That backup can't be restored, so nothing was changed. ${/screenshot/i.test(error?.message || "") ? "It stores screenshots in the backup folder's images folder: restore it from the list instead of choosing the file." : error?.message || ""}`.trim();
        return;
      }
      const mention = kind === "history"
        ? `This replaces the ${plural(page.state().cases.length, "case")} in this browser with ${plural(history.cases.length, "case")} from ${label}, including Archive, Trash and versions. Settings are not changed.`
        : `This replaces your settings (fields, toolbox, preferences) with the ones from ${label}. Your case notes are kept.`;
      const root = backupChosen ? await getRoot(false).catch(() => null) : null;
      const safety = root ? " A safety copy of what you have now is saved first, so you can undo this from the list." : " No backup folder is connected, so no safety copy can be saved first.";
      const ok = await window.CaseDialogs.askChoice({ title: kind === "history" ? "Restore case history?" : "Restore settings?", message: mention + safety, buttons: [{ label: "Restore", value: true, primary: true }, { label: "Cancel", value: false }] });
      if (!ok) return;
      try {
        if (root) await queued(() => CaseSync.safetyCopy(root, kind === "history" ? { state: page.state(), reason: "restore" } : { settingsJson: settingsSnapshot(), reason: "restore" }));
        applyRestore(history, settings);
        awaitingChoice = false;
        $("restoreDialog").close(); $("backupRestoreMenu")?.close();
        const done = `Restored ${kind === "history" ? "case history" : "settings"} from ${label}.${root ? " Your previous version was kept as a safety copy." : ""}`;
        page.report(done);
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
      const ok = await window.CaseDialogs.askChoice({ title: "Delete all backups?", message: `Every snapshot, manual backup, safety copy and screenshot file in ${folderLabel()} will be permanently deleted. Your notes in this browser are not affected, and automatic backups start again the next time your notes change. Other files in the folder are never touched.`, typeToConfirm: "DELETE", buttons: [{ label: "Delete all backups", value: true, primary: true }, { label: "Cancel", value: false }] });
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
      if (!page.writable() || page.copying()) { backupMessage("Another Case Notes window is editing right now. Close it, then try again."); return; }
      const ok = await window.CaseDialogs.askChoice({ title: "Start completely fresh?", message: `This permanently deletes every backup in ${folderLabel()} AND erases all case notes, settings and preferences in this browser. Nothing is kept: there is no safety copy and it cannot be undone. Consider downloading a copy first.`, typeToConfirm: "DELETE", buttons: [{ label: "Erase everything", value: true, primary: true }, { label: "Cancel", value: false }] });
      if (!ok) return;
      try {
        const root = await getRoot(true);
        if (!root) throw Error("Reconnect the backup folder first.");
        await queued(() => CaseSync.deleteAll(root));
        CaseSettings.commit(localStorage, CaseSettings.clearValues());
        const fresh = CaseNotes.empty(); localStorage.setItem(key, JSON.stringify(fresh)); page.replaceState(fresh); awaitingChoice = false;
        window.dispatchEvent(new Event("prosSupportToolboxRestore")); window.dispatchEvent(new Event("supportSettingsRestored"));
        page.render();
        await refreshSummary(root);
        $("backupRestoreMenu")?.close();
        page.report("Everything was erased and Case Notes is starting fresh. Automatic backups continue in the same folder once you add a case.");
      } catch (error) { backupMessage(`Could not finish starting fresh. ${friendlyError(error)}`); }
    }
    async function disconnectFolder() {
      const ok = await window.CaseDialogs.askChoice({ title: "Stop using this backup folder?", message: "Backups stop. Files already in the folder are not deleted, and you can choose the same folder again later.", buttons: [{ label: "Disconnect", value: true, primary: true }, { label: "Cancel", value: false }] });
      if (!ok) return;
      try { await CaseSync.forgetFolder(); } catch {}
      backupChosen = null; backupRoot = null; backupInfo = null; needsPermission = false; awaitingChoice = false; backupProblem = null;
      backupMessage("Backup folder disconnected. Your notes are saved only in this browser until you choose a folder.");
    }
    // Best effort: a failed safety copy never blocks the action, but a successful one makes it undoable from the restore list.
    async function safetyBefore(reason) {
      try {
        const root = backupChosen ? await getRoot(false) : null;
        if (root) await queued(() => CaseSync.safetyCopy(root, { state: page.state(), reason }));
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
    $("downloadHistory")?.addEventListener("click", () => downloadText(CaseBackup.fileName("history", "manual", Date.now()), JSON.stringify(page.state(), null, 2)));
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
    try { const notice = sessionStorage.getItem(noticeKey); if (notice) { sessionStorage.removeItem(noticeKey); page.report(`${notice} The page was reloaded so every setting shows.`); } } catch {}
    return { scheduleBackup, safetyBefore, runBackup };
  }
  return { init };
})();
