"use strict";
// Simple OneDrive sync: writes case-history.json and customer-config.json to a selected folder.
// The OneDrive desktop client handles cloud sync automatically.
const CaseSync = (() => {
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
  
  async function writeFile(folder, name, content) {
    const writer = await (await folder.getFileHandle(name, { create:true })).createWritable();
    try { await writer.write(content); await writer.close(); }
    catch (error) { try { await writer.abort(); } catch {} throw error; }
  }
  
  async function writeHistory(folder, historyJson) {
    await writeFile(folder, HISTORY_FILE, historyJson);
  }
  
  async function writeSettings(folder, settingsJson) {
    await writeFile(folder, SETTINGS_FILE, settingsJson);
  }

  async function readFile(folder, name) {
    return (await (await folder.getFileHandle(name)).getFile()).text();
  }

  function supportsSync() {
    return typeof window.showDirectoryPicker === "function" && typeof indexedDB !== "undefined";
  }
  
  return { storeFolder, restoreFolder, ensurePermission, writeHistory, writeSettings, readFile, supportsSync, HISTORY_FILE, SETTINGS_FILE };
})();
if (typeof module !== "undefined") module.exports = CaseSync;
