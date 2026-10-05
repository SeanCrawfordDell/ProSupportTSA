"use strict";
// Backup folder layout, snapshot naming, retention planning, and screenshot externalization.
// Pure logic only: the page passes in directory listings and file contents, and applies the results.
const CaseBackup = (() => {
  const LATEST_HISTORY = "case-history.json", LATEST_SETTINGS = "customer-config.json", IMAGES_DIR = "images";
  const DAY = 86400000, HOUR = 3600000;
  const RETENTION_OPTIONS = { "7": 7, "30": 30, "90": 90, "never": null };
  const DEFAULT_RETENTION = "30";
  const pad = n => String(n).padStart(2, "0");
  // Local time, sortable, readable: case-history-2026-10-03_142205.json
  function stamp(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }
  function fileName(type, kind, date, reason) {
    if (!["history", "settings"].includes(type)) throw Error("Unknown backup type");
    if (kind === "latest") return type === "history" ? LATEST_HISTORY : LATEST_SETTINGS;
    if (kind === "safety" && !/^[a-z]+(?:-[a-z]+)*$/.test(reason || "")) throw Error("Safety snapshots need a reason");
    const prefix = type === "history" ? "case-history" : "customer-config";
    const tag = kind === "manual" ? "-manual" : kind === "safety" ? `-before-${reason}` : "";
    return `${prefix}${tag}-${stamp(date)}.json`;
  }
  const LOCAL = /^(case-history|customer-config)(?:-(manual)|-before-([a-z]+(?:-[a-z]+)*))?-(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})\.json$/;
  const LEGACY = /^(case-history|customer-config)-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.json$/;
  function parseFileName(name) {
    if (name === LATEST_HISTORY) return { type: "history", kind: "latest", reason: null, time: null, legacy: false };
    if (name === LATEST_SETTINGS) return { type: "settings", kind: "latest", reason: null, time: null, legacy: false };
    let match = LOCAL.exec(name);
    if (match) {
      const [, prefix, manual, reason, y, mo, d, h, mi, s] = match;
      const date = new Date(+y, +mo - 1, +d, +h, +mi, +s), time = date.getTime();
      // Reject rolled-over components such as month 13 so the name only matches real timestamps.
      if (!Number.isFinite(time) || date.getMonth() !== +mo - 1 || date.getDate() !== +d || date.getHours() !== +h || date.getMinutes() !== +mi || date.getSeconds() !== +s) return null;
      return { type: prefix === "case-history" ? "history" : "settings", kind: manual ? "manual" : reason ? "safety" : "auto", reason: reason || null, time, legacy: false };
    }
    match = LEGACY.exec(name);
    if (match) {
      const [, prefix, y, mo, d, h, mi, s, ms] = match;
      return { type: prefix === "case-history" ? "history" : "settings", kind: "auto", reason: null, time: Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, +ms), legacy: true };
    }
    return null;
  }
  function retentionDays(value) {
    const key = String(value ?? DEFAULT_RETENTION);
    return Object.hasOwn(RETENTION_OPTIONS, key) ? RETENTION_OPTIONS[key] : RETENTION_OPTIONS[DEFAULT_RETENTION];
  }
  const dayKey = time => { const d = new Date(time); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
  const weekKey = time => Math.floor((time + 3 * DAY) / (7 * DAY));
  // Decide which automatic snapshots to keep. Files the app did not create, latest files, manual backups
  // and safety snapshots are always kept. Automatic history: everything from the last 24 hours, one per
  // day for up to 30 days, then one per week to the retention limit ("never" keeps all of it).
  // Automatic settings copies follow their own fixed rule, whatever the retention setting: the newest 5 from
  // today and the newest 1 from yesterday; everything older is removed.
  const SETTINGS_PER_DAY = 5;
  function settingsPlan(list, now) {
    const sorted = [...list].sort((a, b) => b.time - a.time), kept = [], removed = [];
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    const today = dayKey(now), before = dayKey(yesterday.getTime());
    let todayCount = 0, yesterdayCount = 0;
    for (const file of sorted) {
      const day = dayKey(file.time);
      if (day === today && todayCount < SETTINGS_PER_DAY) { todayCount++; kept.push(file); }
      else if (day === before && yesterdayCount < 1) { yesterdayCount++; kept.push(file); }
      else if (file.time > now) kept.push(file); // clock skew: never delete a "future" copy
      else removed.push(file);
    }
    return { kept, removed };
  }
  function retentionPlan(files, { now, days, maxBytes = null }) {
    const keep = [], remove = [], candidates = [];
    for (const file of files) {
      const info = parseFileName(file.name);
      if (!info || info.kind !== "auto") { keep.push(file.name); continue; }
      candidates.push({ name: file.name, size: file.size || 0, type: info.type, time: info.time });
    }
    const settings = settingsPlan(candidates.filter(c => c.type === "settings"), now);
    keep.push(...settings.kept.map(f => f.name)); remove.push(...settings.removed);
    const list = candidates.filter(c => c.type === "history").sort((a, b) => b.time - a.time);
    if (days === null || days === undefined) keep.push(...list.map(f => f.name));
    else {
      const kept = [], seenDays = new Set(), seenWeeks = new Set();
      list.forEach((file, index) => {
        const age = now - file.time;
        let keepIt;
        if (index === 0) keepIt = true;
        else if (age < DAY) keepIt = true;
        else if (age < Math.min(days, 30) * DAY) keepIt = !seenDays.has(dayKey(file.time));
        else if (age < days * DAY) keepIt = !seenWeeks.has(weekKey(file.time));
        else keepIt = false;
        if (keepIt) { seenDays.add(dayKey(file.time)); seenWeeks.add(weekKey(file.time)); kept.push(file); }
        else remove.push(file);
      });
      if (maxBytes) {
        let total = kept.reduce((sum, f) => sum + f.size, 0);
        while (total > maxBytes && kept.length > 1) { const oldest = kept.pop(); total -= oldest.size; remove.push(oldest); }
      }
      keep.push(...kept.map(f => f.name));
    }
    return { keep, remove, removedBytes: remove.reduce((sum, f) => sum + f.size, 0) };
  }
  function summarize(files, now = Date.now()) {
    let snapshots = 0, bytes = 0, latest = null, legacy = 0;
    for (const file of files) {
      const info = parseFileName(file.name);
      if (!info) continue;
      bytes += file.size || 0;
      if (info.type === "history" && info.kind !== "latest") { snapshots++; if (info.legacy) legacy++; if (latest === null || info.time > latest) latest = info.time; }
    }
    return { snapshots, bytes, latest, legacy, now };
  }
  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "0 KB";
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1048576).toFixed(bytes < 10 * 1048576 ? 1 : 0)} MB`;
    return `${(bytes / 1073741824).toFixed(2)} GB`;
  }
  // Screenshots are stored once each under images/ and referenced by content hash, so hourly snapshots stay small.
  const DATA_URL = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;
  const EXTENSIONS = { png: "png", jpeg: "jpg", webp: "webp" };
  const MIME = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
  const IMAGE_PATH = /^images\/[a-f0-9]{64}\.(png|jpg|webp)$/;
  async function sha256(text) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  }
  function* notes(state) {
    for (const collection of ["cases", "archive", "trash"]) for (const note of state?.[collection] || []) if (note && typeof note === "object") yield note;
    for (const versions of Object.values(state?.revisions || {})) if (Array.isArray(versions)) for (const version of versions) if (version?.note && typeof version.note === "object") yield version.note;
  }
  function* images(state) {
    for (const note of notes(state)) if (note.images && typeof note.images === "object") for (const image of Object.values(note.images)) if (image && typeof image === "object") yield image;
  }
  async function externalizeImages(state) {
    const copy = JSON.parse(JSON.stringify(state)), files = new Map();
    for (const image of images(copy)) {
      if (typeof image.data !== "string") continue;
      const match = DATA_URL.exec(image.data);
      if (!match) continue;
      const path = `${IMAGES_DIR}/${await sha256(image.data)}.${EXTENSIONS[match[1]]}`;
      files.set(path, image.data);
      image.file = path; delete image.data;
    }
    return { state: copy, files };
  }
  const hasExternalImages = state => { for (const image of images(state)) if (typeof image.file === "string" && typeof image.data !== "string") return true; return false; };
  function imageReferences(state) {
    const refs = new Set();
    for (const image of images(state)) if (typeof image.file === "string") refs.add(image.file);
    return refs;
  }
  async function inlineImages(state, load) {
    const copy = JSON.parse(JSON.stringify(state));
    for (const image of images(copy)) {
      if (typeof image.file !== "string" || typeof image.data === "string") continue;
      if (!IMAGE_PATH.test(image.file)) throw Error("Invalid screenshot reference in backup: " + image.file);
      const data = await load(image.file);
      if (typeof data !== "string" || !DATA_URL.test(data)) throw Error("Screenshot file missing from the backup folder: " + image.file);
      image.data = data; delete image.file;
    }
    return copy;
  }
  function dataUrlToBytes(dataUrl) {
    const match = DATA_URL.exec(dataUrl);
    if (!match) throw Error("Invalid screenshot data");
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  function bytesToDataUrl(bytes, path) {
    const ext = /\.(png|jpg|webp)$/.exec(path)?.[1];
    if (!ext) throw Error("Unknown screenshot type: " + path);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return `data:${MIME[ext]};base64,${btoa(binary)}`;
  }
  const isImagePath = path => IMAGE_PATH.test(path);
  return { LATEST_HISTORY, LATEST_SETTINGS, IMAGES_DIR, HOUR, DAY, RETENTION_OPTIONS, DEFAULT_RETENTION, fileName, parseFileName, retentionDays, retentionPlan, SETTINGS_PER_DAY, summarize, formatBytes, externalizeImages, inlineImages, hasExternalImages, imageReferences, dataUrlToBytes, bytesToDataUrl, isImagePath };
})();
if (typeof module !== "undefined") module.exports = CaseBackup;
