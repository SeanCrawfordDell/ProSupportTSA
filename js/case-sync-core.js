"use strict";
// Backup folder: latest files, dated snapshots, retention cleanup, restore and delete, in a user-selected folder.
// The OneDrive desktop client (if the folder is in OneDrive) handles cloud sync automatically.
const CaseSync = (() => {
  const B = typeof module !== "undefined" ? require("./case-backup-core.js") : CaseBackup;
  const HISTORY_FILE = "case-history.json";
  const SETTINGS_FILE = "customer-config.json";
  const DB_NAME = "dell-support.case-notes.sync-folder";
  
  function dbStore(mode, callback) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
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
  
  async function storeFolder(handle, parentName) {
    await dbStore("readwrite", store => store.put(handle, "sync-folder"));
    if (parentName) await dbStore("readwrite", store => store.put(parentName, "sync-folder-parent"));
  }
  
  async function forgetFolder() {
    await dbStore("readwrite", store => { store.delete("sync-folder"); store.delete("sync-folder-parent"); });
  }

  async function restoreFolder() {
    try {
      const handle = await dbStore("readonly", store => store.get("sync-folder"));
      const parentName = await dbStore("readonly", store => store.get("sync-folder-parent"));
      return { handle, parentName };
    } catch { return { handle: null, parentName: null }; }
  }
  
  async function ensurePermission(handle) {
    if (!handle) return false;
    const options = { mode: "readwrite" };
    if (await handle.queryPermission(options) === "granted") return true;
    return (await handle.requestPermission(options)) === "granted";
  }
  
  // ---- Backup folder engine -------------------------------------------------------------------------
  // Everything below works on any FileSystemDirectoryHandle, so it is tested with an in-memory folder.
  // Layout: case-history.json + customer-config.json (always the latest), dated snapshots, images/ (screenshots).
  const FOLDER_NAME = "ProSupportToolsBackup";
  const isMissing = error => error && (error.name === "NotFoundError" || error.name === "TypeMismatchError");
  async function tryFile(dir, name) {
    try { return await dir.getFileHandle(name); } catch (error) { if (isMissing(error)) return null; throw error; }
  }
  async function tryDir(dir, name) {
    try { return await dir.getDirectoryHandle(name); } catch (error) { if (isMissing(error)) return null; throw error; }
  }
  async function writeFile(folder, name, content) {
    const writer = await (await folder.getFileHandle(name, { create:true })).createWritable();
    try { await writer.write(content); await writer.close(); }
    catch (error) { try { await writer.abort(); } catch {} throw error; }
  }
  async function writeHistory(folder, historyJson) { await writeFile(folder, HISTORY_FILE, historyJson); }
  async function writeSettings(folder, settingsJson) { await writeFile(folder, SETTINGS_FILE, settingsJson); }
  async function readFile(folder, name) { return (await (await folder.getFileHandle(name)).getFile()).text(); }
  async function removeIfPresent(dir, name) {
    try { await dir.removeEntry(name); return true; } catch (error) { if (isMissing(error)) return false; throw error; }
  }
  // The folder the user picks may already be ProSupportToolsBackup, or may hold files from an earlier version.
  // Otherwise ProSupportToolsBackup is created inside it so backups never mix with the user's other files.
  async function resolveRoot(chosen) {
    if (chosen.name === FOLDER_NAME || await tryFile(chosen, HISTORY_FILE)) return chosen;
    return chosen.getDirectoryHandle(FOLDER_NAME, { create: true });
  }
  async function entriesOf(dir) {
    const out = [];
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind !== "file") continue;
      const file = await handle.getFile();
      out.push({ name, size: file.size, lastModified: file.lastModified });
    }
    return out;
  }
  async function imageFiles(root) {
    const dir = await tryDir(root, B.IMAGES_DIR);
    return dir ? (await entriesOf(dir)).filter(f => B.isImagePath(`${B.IMAGES_DIR}/${f.name}`)) : [];
  }
  async function listFiles(root) { return entriesOf(root); }
  // Snapshots the app created, newest first. "Latest" files report their last-modified time.
  async function listSnapshots(root) {
    const out = [];
    for (const file of await listFiles(root)) {
      const info = B.parseFileName(file.name);
      if (info) out.push({ ...file, ...info, time: info.time ?? file.lastModified });
    }
    return out.sort((a, b) => b.time - a.time);
  }
  async function summary(root, now = Date.now()) {
    const files = await listFiles(root), images = await imageFiles(root);
    const base = B.summarize(files, now);
    const imageBytes = images.reduce((sum, f) => sum + f.size, 0);
    const info = files.map(f => ({ ...f, info: B.parseFileName(f.name) }));
    const latest = info.find(f => f.name === HISTORY_FILE);
    return { ...base, bytes: base.bytes + imageBytes, imageBytes, lastBackup: latest ? latest.lastModified : null,
      hasBackups: info.some(f => f.info) || images.length > 0 };
  }
  async function writeMissingImages(root, files) {
    if (!files.size) return;
    const dir = await root.getDirectoryHandle(B.IMAGES_DIR, { create: true });
    for (const [path, dataUrl] of files) {
      const name = path.slice(B.IMAGES_DIR.length + 1);
      if (await tryFile(dir, name)) continue;
      await writeFile(dir, name, B.dataUrlToBytes(dataUrl));
    }
  }
  const settingsFingerprint = text => {
    try { const value = JSON.parse(text); delete value.exportedAt; return JSON.stringify(value); } catch { return text; }
  };
  // Saves the latest files and, when due, dated snapshots. Hourly automatic snapshots; manual ones always.
  async function backup(root, { state, settingsJson, now = Date.now(), manual = false, retention = B.DEFAULT_RETENTION }) {
    const { state: external, files } = await B.externalizeImages(state);
    await writeMissingImages(root, files);
    const historyText = JSON.stringify(external, null, 2);
    const result = { snapshot: null, settingsSnapshot: null, cleaned: null };
    await writeHistory(root, historyText);
    const existing = await listSnapshots(root);
    const lastAuto = existing.find(f => f.type === "history" && f.kind === "auto");
    if (manual) {
      result.snapshot = B.fileName("history", "manual", now);
      await writeFile(root, result.snapshot, historyText);
    } else if (!lastAuto || now - lastAuto.time >= B.HOUR) {
      result.snapshot = B.fileName("history", "auto", now);
      await writeFile(root, result.snapshot, historyText);
    }
    if (settingsJson !== undefined && settingsJson !== null) {
      const previous = await tryFile(root, SETTINGS_FILE);
      const changed = !previous || settingsFingerprint(await (await previous.getFile()).text()) !== settingsFingerprint(settingsJson);
      await writeSettings(root, settingsJson);
      // A settings copy accompanies every history snapshot, and is also added whenever a setting changes.
      if (manual || changed || result.snapshot) {
        result.settingsSnapshot = B.fileName("settings", manual ? "manual" : "auto", now);
        await writeFile(root, result.settingsSnapshot, settingsJson);
      }
    }
    if (result.snapshot || result.settingsSnapshot) result.cleaned = await cleanup(root, { retention, now });
    return result;
  }
  // Written before anything replaces or removes the user's data, so the action can be undone from the list.
  async function safetyCopy(root, { state, settingsJson, reason, now = Date.now() }) {
    const names = [];
    if (state) {
      const { state: external, files } = await B.externalizeImages(state);
      await writeMissingImages(root, files);
      const name = B.fileName("history", "safety", now, reason);
      await writeFile(root, name, JSON.stringify(external, null, 2));
      names.push(name);
    }
    if (settingsJson) {
      const name = B.fileName("settings", "safety", now, reason);
      await writeFile(root, name, settingsJson);
      names.push(name);
    }
    if (!names.length) throw Error("Nothing to save a safety copy of.");
    return names[0];
  }
  async function loadHistoryText(root, name) {
    const info = B.parseFileName(name);
    if (!info || info.type !== "history") throw Error("That is not a case-history backup.");
    const state = JSON.parse(await readFile(root, name));
    if (!B.hasExternalImages(state)) return JSON.stringify(state);
    const dir = await tryDir(root, B.IMAGES_DIR);
    const full = await B.inlineImages(state, async path => {
      const handle = dir && await tryFile(dir, path.slice(B.IMAGES_DIR.length + 1));
      return handle ? B.bytesToDataUrl(new Uint8Array(await (await handle.getFile()).arrayBuffer()), path) : null;
    });
    return JSON.stringify(full);
  }
  async function loadSettingsText(root, name) {
    const info = B.parseFileName(name);
    if (!info || info.type !== "settings") throw Error("That is not a settings backup.");
    return readFile(root, name);
  }
  // Screenshot files that no remaining backup refers to. Skipped entirely if any backup cannot be read.
  async function sweepImages(root) {
    const used = new Set();
    for (const file of await listFiles(root)) {
      const info = B.parseFileName(file.name);
      if (!info || info.type !== "history") continue;
      let state;
      try { state = JSON.parse(await readFile(root, file.name)); } catch { return 0; }
      for (const ref of B.imageReferences(state)) used.add(ref);
    }
    const dir = await tryDir(root, B.IMAGES_DIR);
    let removed = 0;
    if (!dir) return 0;
    for (const file of await imageFiles(root)) {
      if (used.has(`${B.IMAGES_DIR}/${file.name}`)) continue;
      if (await removeIfPresent(dir, file.name)) removed++;
    }
    return removed;
  }
  async function deleteSnapshot(root, name) {
    if (!B.parseFileName(name)) throw Error("That file is not a backup created by this app.");
    const removed = await removeIfPresent(root, name);
    const images = await sweepImages(root);
    return { removed: removed ? 1 : 0, images };
  }
  // Applies the retention plan: thins automatic snapshots, then removes screenshots nothing refers to.
  async function cleanup(root, { retention = B.DEFAULT_RETENTION, now = Date.now() }) {
    const plan = B.retentionPlan(await listFiles(root), { now, days: B.retentionDays(retention) });
    for (const file of plan.remove) await removeIfPresent(root, file.name);
    const images = plan.remove.length ? await sweepImages(root) : 0;
    return { removed: plan.remove.length, bytes: plan.removedBytes, images };
  }
  // Removes only files this app recognizes, plus the images folder it created. Anything else in the folder stays.
  async function deleteAll(root) {
    let removed = 0, images = 0;
    for (const file of await listFiles(root)) if (B.parseFileName(file.name) && await removeIfPresent(root, file.name)) removed++;
    const dir = await tryDir(root, B.IMAGES_DIR);
    if (dir) {
      for (const file of await imageFiles(root)) if (await removeIfPresent(dir, file.name)) images++;
      if (!(await entriesOf(dir)).length && !(await hasSubfolders(dir))) await removeIfPresent(root, B.IMAGES_DIR);
    }
    return { removed, images };
  }
  async function hasSubfolders(dir) {
    for await (const [, handle] of dir.entries()) if (handle.kind === "directory") return true;
    return false;
  }

  function supportsSync() {
    return typeof window.showDirectoryPicker === "function" && typeof indexedDB !== "undefined";
  }
  
  return { storeFolder, restoreFolder, forgetFolder, ensurePermission, writeHistory, writeSettings, readFile, supportsSync, resolveRoot, listSnapshots, summary, backup, safetyCopy, loadHistoryText, loadSettingsText, deleteSnapshot, cleanup, deleteAll, sweepImages, FOLDER_NAME, HISTORY_FILE, SETTINGS_FILE };
})();
if (typeof module !== "undefined") module.exports = CaseSync;
