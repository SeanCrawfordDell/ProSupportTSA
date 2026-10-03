"use strict";
const CaseSettings = (() => {
  const templateCore = typeof module !== "undefined" ? require("./case-toolkit-core.js") : CaseToolkitCore;
  const keys = {
    aiTasks: "dell-support.custom-ai-tasks", theme: "theme", templates: "dell-support.case-templates.v1",
    floating: "dell-support.case-notes.action-dock-floating",
    historyCollapsed: "dell-support.case-history-collapsed",
    sections: "dell-support.case-notes-sections", pins: "dell-support.pinned-resources.v1"
  };
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  function validate(config, fields) {
    const bad = () => { throw Error("Invalid settings backup. No settings were changed."); };
    if (!object(config) || !object(config.fieldConfig) || !object(config.fieldConfig.customFields) || !Array.isArray(config.fieldConfig.order)) bad();
    config = JSON.parse(JSON.stringify(config));
    const notesCore = typeof module !== "undefined" ? require("./case-notes-core.js") : CaseNotes;
    notesCore.migrateLegacyFieldConfig(config.fieldConfig);
    const reserved = new Set(["__proto__", "constructor", "prototype", "id", "created", "updated", "started", "elapsed", "lastSession", "images", "toolkit", "pinned", "deletedAt", "entries", "activeEntryId"]);
    const customFields = {};
    for (const [id, label] of Object.entries(config.fieldConfig.customFields)) {
      // Older versions allowed long labels; keep those backups restorable.
      if (!/^[a-zA-Z0-9_-]+$/.test(id) || reserved.has(id) || Object.hasOwn(fields, id) || typeof label !== "string" || !label.trim()) bad();
      customFields[id] = label;
    }
    const allowed = [...Object.keys(fields), ...Object.keys(customFields)];
    const order = config.fieldConfig.order;
    if (new Set(order).size !== order.length || order.some(id => !allowed.includes(id))) bad();
    const result = { fieldConfig: {customFields, order:[...order, ...allowed.filter(id => !order.includes(id))]}, values:{} };
    if (config.toolbox !== undefined) {
      const box = config.toolbox;
      if (!object(box) || !Array.isArray(box.shortcuts) || box.shortcuts.length > 4 || !object(box.appearance) || !Array.isArray(box.appearance.order) || !object(box.appearance.colors)) bad();
      box.shortcuts.forEach(link => {
        if (!object(link) || typeof link.name !== "string" || !link.name.trim() || typeof link.url !== "string") bad();
        let url; try { url = new URL(link.url); } catch { bad(); }
        if (!["http:","https:"].includes(url.protocol) || url.username || url.password) bad();
      });
      const { icon, size, animate, iconScale, circle } = box.appearance;
      if ((icon !== undefined && (typeof icon !== "string" || !/^[a-z0-9-]{1,32}$/.test(icon))) || (size !== undefined && (typeof size !== "number" || !Number.isFinite(size) || size < 40 || size > 120)) || (animate !== undefined && typeof animate !== "boolean") || (iconScale !== undefined && (typeof iconScale !== "number" || !Number.isFinite(iconScale) || iconScale < 40 || iconScale > 140)) || (circle !== undefined && typeof circle !== "boolean")) bad();
      if (box.appearance.order.some(id => typeof id !== "string") || Object.values(box.appearance.colors).some(color => !/^#[a-f0-9]{6}$/i.test(color))) bad();
      result.values["dell-support.toolbox-links.v1"] = JSON.stringify(box.shortcuts);
      result.values["dell-support.toolbox-appearance.v1"] = JSON.stringify(box.appearance);
    }
    if (config.preferences !== undefined) {
      if (!object(config.preferences)) bad();
      for (const [name, value] of Object.entries(config.preferences)) {
        if (!Object.hasOwn(keys, name)) continue;
        if (name === "templates") templateCore.validateTemplates(value);
        if (name === "theme" && ![null,"dark","light"].includes(value)) bad();
        if (["floating","historyCollapsed"].includes(name) && ![null,"true","false"].includes(value)) bad();
        if (name === "sections" && (!object(value) || Object.keys(value).some(id => !["caseDetails","notes","actionPlan"].includes(id)) || Object.values(value).some(v => typeof v !== "boolean"))) bad();
        if (name === "pins" && (!Array.isArray(value) || value.some(id => typeof id !== "string"))) bad();
        if (name === "aiTasks") {
          if (!object(value)) bad();
          for (const [id, task] of Object.entries(value)) {
            if (!/^[a-zA-Z0-9_-]+$/.test(id) || reserved.has(id) || !object(task) || typeof task.label !== "string" || typeof task.instruction !== "string") bad();
          }
        }
        result.values[keys[name]] = ["theme","floating","historyCollapsed"].includes(name) ? value : JSON.stringify(value);
      }
    }
    return result;
  }
  function capture(storage) {
    const result = {};
    for (const [name,key] of Object.entries(keys)) {
      const raw = storage.getItem(key);
      result[name] = ["theme","floating","historyCollapsed"].includes(name) ? raw : JSON.parse(raw || (name === "pins" ? "[]" : "{}"));
    }
    return result;
  }
  function commit(storage, values) {
    const original = Object.fromEntries(Object.keys(values).map(key => [key,storage.getItem(key)]));
    const written = [];
    try {
      for (const [key,value] of Object.entries(values)) {
        if (value === null) storage.removeItem(key); else storage.setItem(key,value);
        written.push(key);
      }
    } catch {
      let rollbackFailed = false;
      for (const key of written.reverse()) {
        try { if (original[key] === null) storage.removeItem(key); else storage.setItem(key,original[key]); } catch { rollbackFailed = true; }
      }
      throw Error(rollbackFailed ? "Settings could not be saved completely. Some preferences may have changed; keep this page open and retry." : "Settings could not be saved. Previous settings were kept.");
    }
  }
  return { capture, validate, commit };
})();
if (typeof module !== "undefined") module.exports = CaseSettings;
