"use strict";
// Pure case operations, shared with the Node regression tests.
const CaseNotes = (() => {
  const Toolkit = typeof module !== "undefined" ? require("./case-toolkit-core.js") : CaseToolkitCore;
  const fields = { tag: "Service Tag", platform: "System/Platform", request: "Service Request Number", os: "OS/Solution", osVersion: "OS version / build", country: "Customer Country", supportType: "OS Support Entitlement Verification", logLocation: "Log Location", issue: "Issue Description", notes: "Notes", next: "Action Plan / Next Steps" };
  const defaultFieldOrder = Object.keys(fields);
  const supportTypes = ["OEM OS", "ProSupport Plus Bring Your own License", "Solution Support includes OS", "No Software Support"];
  // Earlier versions stored short codes; map them to the current entitlement options.
  const legacySupportTypes = { "OEM": "OEM OS", "PSP": "ProSupport Plus Bring Your own License", "No OS Support": "No Software Support" };
  const normalizeSupportType = value => Object.hasOwn(legacySupportTypes, value) ? legacySupportTypes[value] : value;
  const empty = () => ({ version: 3, selected: null, cases: [], archive: [], trash: [], revisions: {}, fieldConfig: { order: [...defaultFieldOrder], customFields: {} } });
  function migrateEntries(note) {
    note.activeEntryId = "initial-" + note.id;
    note.entries = [{ id: note.activeEntryId, created: note.created, updated: note.updated, notes: note.notes, next: note.next }];
  }
  // Top-level notes/next remain the active editor fields for existing tools.
  // Entries retain the history; synchronize before storage or changing selection.
  function syncEntry(note, now = note.updated) {
    const entry = note.entries.find(item => item.id === note.activeEntryId);
    if (!entry) throw Error("Invalid active note entry");
    if (entry.notes !== note.notes || entry.next !== note.next) {
      entry.notes = note.notes; entry.next = note.next;
      entry.updated = Math.max(entry.updated, now);
    }
  }
  function entryList(note) {
    return (note.entries || [{id:"initial-" + note.id,created:note.created,updated:note.updated,notes:note.notes,next:note.next}])
      .map(entry => entry.id === note.activeEntryId ? {...entry, notes:note.notes, next:note.next} : {...entry})
      .sort((a,b) => a.created - b.created);
  }
  function selectEntry(note, id) {
    const entry = note.entries.find(item => item.id === id);
    if (!entry) throw Error("Note entry not found");
    syncEntry(note);
    note.activeEntryId = id; note.notes = entry.notes; note.next = entry.next;
  }
  function addEntry(note, id, now) {
    if (typeof id !== "string" || !id || note.entries.some(item => item.id === id) || !Number.isFinite(now) || now < 0) throw Error("Invalid new note entry");
    syncEntry(note);
    note.entries.push({id,created:now,updated:now,notes:"",next:""});
    selectEntry(note,id); note.updated = now;
  }
  function exportField(note, field) {
    if (!["notes","next"].includes(field)) return note[field] || "";
    const entries = entryList(note);
    if (entries.length === 1) return entries[0][field];
    return entries.map(entry => "### " + new Date(entry.created).toLocaleString() + "\n\n" + (entry[field] || "(No content recorded)")).join("\n\n");
  }
  const elapsed = (note, now) => note.elapsed + (note.started === null ? 0 : Math.max(0, now - note.started));
  const lastSession = (note, now) => note.started === null ? (note.lastSession || 0) : Math.max(0, now - note.started);
  function stop(note, now) {
    if (note.started !== null) note.lastSession = Math.max(0, now - note.started);
    note.elapsed = elapsed(note, now); note.started = null;
  }
  function start(state, note, now) {
    if (note.started !== null) return;
    state.cases.forEach(item => { if (item.started !== null) stop(item, now); });
    note.started = now;
  }
  function create(state, id, now) {
    state.cases.forEach(item => { if (item.started !== null) stop(item, now); });
    const fieldConfig = state.fieldConfig || { order: [...defaultFieldOrder], customFields: {} };
    const allFields = { ...fields, ...fieldConfig.customFields };
    const note = { toolkit: Toolkit.defaults(), id, created: now, updated: now, elapsed: 0, started: now, lastSession: 0, ...Object.fromEntries(Object.keys(allFields).map(key => [key, ""])) };
    migrateEntries(note);
    state.cases.unshift(note); trimWorkingList(state, now); state.selected = id;
    return note;
  }
  function duration(ms) {
    const seconds = Math.floor(ms / 1000);
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, "0")).join(":");
  }
  function plainImages(text) {
    let plain = text.replace(/!\[([^\]]*)\]\(attachment:[a-zA-Z0-9-]+\)/g, (_, label) => `[Screenshot: ${label || "image"}; view in Case Notes]`);
    if (/<[a-z][^>]*>/i.test(plain)) {
      plain = plain.replace(/<img\b[^>]*>/gi, tag => {
        const label = /alt="([^"]*)"/i.exec(tag)?.[1] || "image";
        return `[Screenshot: ${label}; view in Case Notes]`;
      }).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
        .replace(/<li\b[^>]*>/gi, "\n- ")
        .replace(/<br\s*\/?>|<\/(?:p|div|h[1-6]|li|tr|blockquote|pre)>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (full, entity) => {
          const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
          if (entity[0] !== "#") return named[entity.toLowerCase()] || full;
          const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
          return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : full;
        }).replace(/\n{3,}/g, "\n\n").trim();
    }
    return plain;
  }
  function copyText(note, now, fieldConfig = null) {
    const extra = Toolkit.extraText(note);
    const config = fieldConfig || { order: [...defaultFieldOrder], customFields: {} };
    const allFields = { ...fields, ...config.customFields };
    const orderedFields = config.order.filter(key => allFields[key]).concat(Object.keys(config.customFields).filter(key => !config.order.includes(key)));
    return [...orderedFields.map(key => `${allFields[key] || key}:\n${plainImages(exportField(note,key))}`), ...(extra ? [extra] : []), `Time Spent:\n${duration(elapsed(note, now))}`].join("\n\n");
  }
  function emailFile(note, now, content, token, fieldConfig = null) {
    if (!/^[a-zA-Z0-9-]+$/.test(token)) throw Error("Invalid email ID");
    const base64 = text => btoa(Array.from(new TextEncoder().encode(text), byte => String.fromCharCode(byte)).join(""));
    const wrap = text => (text.match(/.{1,76}/g) || []).join("\r\n");
    const requestNumber = note.request.replace(/[\r\n]+/g, " ").trim();
    const subject = `Service Request # ${requestNumber} - Case Notes`;
    const subjectHeader = (Array.from(subject).join("").match(/.{1,20}/gu) || []).map(chunk => `=?UTF-8?B?${base64(chunk)}?=`).join("\r\n ");
    const related = "related-" + token, alternative = "alternative-" + token;
    const lines = ["MIME-Version: 1.0", "X-Unsent: 1", "Date: " + new Date(now).toUTCString(), "Subject: " + subjectHeader,
      `Content-Type: multipart/related; boundary="${related}"`, "", `--${related}`,
      `Content-Type: multipart/alternative; boundary="${alternative}"`, "",
      `--${alternative}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap(base64(copyText(note, now, fieldConfig))),
      `--${alternative}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap(base64(content.html)), `--${alternative}--`];
    for (const [id, image] of Object.entries(content.images)) {
      const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(image.data);
      if (!/^[a-zA-Z0-9-]+$/.test(id) || !match) throw Error("Invalid screenshot");
      const filename = `screenshot-${id}.${match[1] === "jpeg" ? "jpg" : match[1]}`;
      lines.push(`--${related}`, `Content-Type: image/${match[1]}; name="${filename}"`, "Content-Transfer-Encoding: base64",
        `Content-ID: <${id}@case-notes>`, `Content-Disposition: inline; filename="${filename}"`, "", wrap(match[2]));
    }
    lines.push(`--${related}--`, "");
    return lines.join("\r\n");
  }
  function backup(state, now) {
    const snapshot = parse(JSON.stringify(state));
    snapshot.cases.forEach(note => stop(note, now));
    return JSON.stringify(snapshot, null, 2);
  }
  function trimWorkingList(state, now) {
    state.archive ||= [];
    while (state.cases.length > 100) {
      let index = state.cases.findLastIndex(note => !note.pinned);
      if (index <= 0) index = state.cases.length - 1;
      const [note] = state.cases.splice(index, 1);
      stop(note, now); state.archive.unshift(note);
    }
  }
  function move(state, id, from, to, now) {
    if (!["cases", "archive", "trash"].includes(from) || !["cases", "archive", "trash"].includes(to) || from === to) throw Error("Invalid case move");
    state[from] ||= []; state[to] ||= [];
    const index = state[from].findIndex(note => note.id === id);
    if (index < 0) throw Error("Case not found");
    const [note] = state[from].splice(index, 1);
    stop(note, now);
    if (to === "trash") note.deletedAt = now; else delete note.deletedAt;
    state[to].unshift(note);
    if (to === "cases") { trimWorkingList(state, now); state.selected = id; }
    else if (state.selected === id) state.selected = state.cases[0]?.id || null;
    return note;
  }
  const contentSignature = note => JSON.stringify({...Object.fromEntries(Object.entries(note).filter(([key]) => !["started", "elapsed", "lastSession", "updated", "pinned", "deletedAt", "activeEntryId", "notes", "next", "entries"].includes(key))),entries:entryList(note)});
  function checkpoint(state, previous, now) {
    state.revisions ||= {};
    const current = new Map(state.cases.map(note => [note.id, note]));
    for (const before of previous?.cases || []) {
      const after = current.get(before.id);
      if (!after || contentSignature(before) === contentSignature(after)) continue;
      const versions = Object.hasOwn(state.revisions,before.id) ? state.revisions[before.id] : [];
      const snapshot = JSON.parse(JSON.stringify(before)); stop(snapshot, now);
      for (const id of Object.keys(previous?.fieldConfig?.customFields || {})) {
        if (!Object.hasOwn(state.fieldConfig.customFields,id)) delete snapshot[id];
      }
      versions.unshift({ savedAt: now, note: snapshot });
      state.revisions[before.id] = versions.slice(0, 10);
    }
  }
  function searchText(note) {
    return [...Object.entries(note).filter(([key,value]) => !["id","activeEntryId"].includes(key) && typeof value === "string").map(([,value]) => value), ...entryList(note).flatMap(entry=>[entry.notes,entry.next]), ...Object.values(note.toolkit || {}).filter(value => typeof value === "string")].map(plainImages).join("\n");
  }
  function excerpt(note, query) {
    const text = searchText(note).replace(/\s+/g, " ");
    const at = text.toLowerCase().indexOf(query.toLowerCase());
    const start = Math.max(0, at - 40);
    return (start ? "…" : "") + text.slice(start, start + 160) + (text.length > start + 160 ? "…" : "");
  }
  function escalation(note, now, fieldConfig = null) {
    const config = fieldConfig || { order: [...defaultFieldOrder], customFields: {} };
    const customFieldsData = {};
    Object.keys(config.customFields).forEach(key => {
      if (note[key]) customFieldsData[config.customFields[key]] = note[key];
    });
    const workflow = note.toolkit?.workflow || {}, checks = note.toolkit?.checks || {};
    // Triage Production Status carries straight onto the escalation's Production Status field, which offers the same options; Unspecified stays blank.
    const production = workflow.severity && workflow.severity !== "Unspecified" ? String(workflow.severity) : "";
    const evidence = String(note.logLocation || "").trim() || Object.values(checks).some(Boolean) ? "Yes" : "";
    // Results stay empty on purpose: outcomes must be recorded per action on the escalation page.
    return { problem: note.issue, tag: note.tag, os: note.os, country: note.country,
      osVersion: note.osVersion || "", serviceRequest: note.request, platform: note.platform || "", supportType: normalizeSupportType(note.supportType || ""), logLocation: note.logLocation || "", impact: note.toolkit?.impact || "", checks, issueType: note.toolkit?.issueType || "general",
      changes: String(workflow.recentChange || ""), production, evidence, results: "",
      troubleshooting: plainImages(exportField(note,"notes")), nextSteps: plainImages(exportField(note,"next")), sourceNote: copyText(note, now, config), customFields: customFieldsData };
  }
  // Preserve custom IDs accepted before dated entries reserved these names.
  function migrateLegacyFieldConfig(config, notes = []) {
    if (!config || !config.customFields || typeof config.customFields !== "object" || Array.isArray(config.customFields) || !Array.isArray(config.order)) return;
    for (const oldId of ["entries", "activeEntryId"]) {
      if (!Object.hasOwn(config.customFields, oldId)) continue;
      let newId = "legacy_" + oldId;
      while (Object.hasOwn(config.customFields, newId) || Object.hasOwn(fields, newId)) newId += "_";
      config.customFields[newId] = config.customFields[oldId]; delete config.customFields[oldId];
      config.order = config.order.map(id => id === oldId ? newId : id);
      for (const note of notes) {
        if (note && typeof note === "object" && Object.hasOwn(note, oldId)) {
          note[newId] = note[oldId]; delete note[oldId];
        }
      }
    }
  }
  function parse(raw, nested = false) {
    if (raw === null) return empty();
    const state = JSON.parse(raw);
    if (!state || typeof state !== "object" || Array.isArray(state)) throw Error("Invalid history");
    if (state.version === 1) {
      state.version = 2;
      state.fieldConfig = { order: [...defaultFieldOrder], customFields: {} };
    }
    if (![2,3].includes(state.version) || !Array.isArray(state.cases) || state.cases.length > 100) throw Error("Invalid history");
    const inputVersion = state.version; state.version = 3;
    if (!state.fieldConfig) state.fieldConfig = { order: [...defaultFieldOrder], customFields: {} };
    const config = state.fieldConfig;
    if (inputVersion === 2) {
      const legacyNotes = [...state.cases];
      for (const name of ["archive", "trash"]) if (Array.isArray(state[name])) legacyNotes.push(...state[name]);
      if (state.revisions && typeof state.revisions === "object") {
        for (const versions of Object.values(state.revisions)) if (Array.isArray(versions)) legacyNotes.push(...versions.map(version => version?.note));
      }
      migrateLegacyFieldConfig(config, legacyNotes);
    }
    const reserved = new Set(["__proto__", "constructor", "prototype", "id", "created", "updated", "started", "elapsed", "lastSession", "images", "toolkit", "pinned", "deletedAt", "entries", "activeEntryId"]);
    if (!config.customFields || typeof config.customFields !== "object" || Array.isArray(config.customFields) || !Array.isArray(config.order)) throw Error("Invalid field configuration");
    for (const [id,label] of Object.entries(config.customFields)) {
      if (!/^[a-zA-Z0-9_-]+$/.test(id) || reserved.has(id) || Object.hasOwn(fields,id) || typeof label !== "string" || !label.trim()) throw Error("Invalid custom field");
    }
    const allowedFields = [...Object.keys(fields), ...Object.keys(config.customFields)];
    if (new Set(config.order).size !== config.order.length || config.order.some(id => !allowedFields.includes(id))) throw Error("Invalid field order");
    config.order.push(...allowedFields.filter(id => !config.order.includes(id)));
    const ids = new Set(); let running = 0;
    const allFields = { ...fields, ...state.fieldConfig.customFields };
    for (const note of state.cases) {
      if (note && reserved.has(note.id)) throw Error("Invalid case ID");
      // Older saved cases predate these optional fields; retain all existing data.
      if (note && typeof note === "object") {
        for (const key of ["os", "country", "supportType", "logLocation", "platform", "osVersion"]) {
          if (!Object.hasOwn(note, key)) note[key] = "";
        }
        if (typeof note.supportType === "string") note.supportType = normalizeSupportType(note.supportType);
        // Add custom fields to existing notes
        for (const key of Object.keys(state.fieldConfig.customFields)) {
          if (!Object.hasOwn(note, key)) note[key] = "";
        }
        // Older saved cases predate per-session tracking.
        if (!Object.hasOwn(note, "lastSession")) note.lastSession = 0;
      }
      if (!note || typeof note.id !== "string" || ids.has(note.id) || ![note.created, note.updated, note.elapsed, note.lastSession].every(n => Number.isFinite(n) && n >= 0) || !(note.started === null || (Number.isFinite(note.started) && note.started >= 0)) || !Object.keys(allFields).every(key => typeof note[key] === "string")) throw Error("Invalid case");
      if (inputVersion === 2 && !Object.hasOwn(note,"entries")) migrateEntries(note);
      if (!Array.isArray(note.entries) || !note.entries.length) throw Error("Invalid note entries");
      const entryIds = new Set();
      for (const entry of note.entries) {
        if (!entry || typeof entry.id !== "string" || !entry.id || ["__proto__","constructor","prototype"].includes(entry.id) || entryIds.has(entry.id) || ![entry.created,entry.updated].every(n=>Number.isFinite(n)&&n>=0) || typeof entry.notes !== "string" || typeof entry.next !== "string") throw Error("Invalid note entry");
        entryIds.add(entry.id);
      }
      if (!entryIds.has(note.activeEntryId)) throw Error("Invalid active note entry");
      syncEntry(note);
      if (!Object.hasOwn(note, "images")) note.images = {};
      if (!note.images || typeof note.images !== "object" || Array.isArray(note.images) || !Object.entries(note.images).every(([id, image]) => /^[a-zA-Z0-9-]+$/.test(id) && image && typeof image.name === "string" && typeof image.data === "string" && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image.data))) throw Error("Invalid screenshots");
      Toolkit.validate(note);
      ids.add(note.id); if (note.started !== null) running++;
    }
    if (running > 1 || !(state.selected === null || ids.has(state.selected))) throw Error("Invalid selection");
    if (!nested) {
      for (const collection of ["archive", "trash"]) {
        state[collection] ||= [];
        if (!Array.isArray(state[collection])) throw Error("Invalid saved collection");
        state[collection] = state[collection].map(note => {
          const valid = parse(JSON.stringify({ version:inputVersion, cases:[note], selected:null, fieldConfig:state.fieldConfig }), true).cases[0];
          if (ids.has(valid.id)) throw Error("Duplicate case");
          ids.add(valid.id); valid.started = null; return valid;
        });
      }
      state.revisions ||= {};
      if (typeof state.revisions !== "object" || Array.isArray(state.revisions)) throw Error("Invalid versions");
      for (const [id, versions] of Object.entries(state.revisions)) {
        if (reserved.has(id) || !ids.has(id)) throw Error("Invalid version case ID");
        if (!Array.isArray(versions) || versions.length > 10) throw Error("Invalid versions");
        versions.forEach(version => {
          if (!version || !Number.isFinite(version.savedAt) || version.note?.id !== id) throw Error("Invalid version");
          version.note = parse(JSON.stringify({version:inputVersion, cases:[version.note], selected:null, fieldConfig:state.fieldConfig}), true).cases[0];
          version.note.started = null;
        });
      }
    }
    state.cases.sort((a, b) => b.created - a.created);
    return state;
  }
  function addCustomField(state, fieldId, fieldLabel) {
    if (typeof fieldLabel !== "string" || !fieldLabel.trim() || fieldLabel.length > 120) throw Error("Field labels must contain 1–120 characters.");
    if (!/^[a-zA-Z0-9_-]+$/.test(fieldId)) throw Error("Invalid field ID");
    if (["id","created","updated","started","elapsed","lastSession","images","toolkit","pinned","deletedAt","entries","activeEntryId","__proto__","constructor","prototype"].includes(fieldId)) throw Error("Reserved field ID");
    if (fields[fieldId] || state.fieldConfig.customFields[fieldId]) throw Error("Field already exists");
    state.fieldConfig.customFields[fieldId] = fieldLabel;
    state.fieldConfig.order.push(fieldId);
    // Add empty value to all existing cases
    state.cases.forEach(note => note[fieldId] = "");
    return state;
  }
  function removeCustomField(state, fieldId) {
    if (fields[fieldId]) throw Error("Cannot remove built-in field");
    if (!state.fieldConfig.customFields[fieldId]) throw Error("Custom field not found");
    delete state.fieldConfig.customFields[fieldId];
    state.fieldConfig.order = state.fieldConfig.order.filter(id => id !== fieldId);
    // Remove field from all existing cases
    for (const collection of [state.cases,state.archive || [],state.trash || []]) {
      collection.forEach(note => delete note[fieldId]);
    }
    Object.values(state.revisions || {}).flat().forEach(version => delete version.note[fieldId]);
    return state;
  }
  function resetCustomFields(state) {
    Object.keys(state.fieldConfig.customFields).forEach(id => removeCustomField(state,id));
    state.fieldConfig.order = [...defaultFieldOrder];
    return state;
  }
  function reorderFields(state, newOrder) {
    if (!Array.isArray(newOrder)) throw Error("Invalid order");
    const allFields = { ...fields, ...state.fieldConfig.customFields };
    if (!newOrder.every(id => allFields[id])) throw Error("Invalid field in order");
    if (newOrder.length !== Object.keys(allFields).length) throw Error("Missing fields in order");
    state.fieldConfig.order = newOrder;
    return state;
  }
  function getEffectiveFields(state) {
    const allFields = { ...fields, ...state.fieldConfig.customFields };
    return state.fieldConfig.order.filter(key => allFields[key]).map(key => ({ id: key, label: allFields[key] }));
  }
  return { migrateLegacyFieldConfig, fields, defaultFieldOrder, supportTypes, normalizeSupportType, empty, elapsed, lastSession, stop, start, create, duration, plainText: plainImages, copyText, emailFile, backup, escalation, parse, addCustomField, removeCustomField, resetCustomFields, reorderFields, getEffectiveFields, move, checkpoint, searchText, excerpt, trimWorkingList, syncEntry, entryList, selectEntry, addEntry, exportField };
})();
if (typeof module !== "undefined") module.exports = CaseNotes;
