"use strict";
// Slash commands typed on their own line in Notes, e.g. "/st ABC1234", fill in a case field.
const CaseSlash = (() => {
  // Short codes for the built-in fields. Custom fields use their own id as the code.
  const builtIn = {
    tag: "st", request: "sr", platform: "pl", os: "os", osVersion: "osv", country: "cc", supportType: "sup",
    logLocation: "log", issue: "iss", caseIssueType: "it", productApp: "prod", severity: "sev",
    recentChange: "chg", fix: "fix", verification: "ver", prevention: "prev", repeatOf: "rep", knowledge: "kb"
  };
  const excluded = new Set(["notes", "next"]);
  // fields: [{id, label, custom?, options?: [{value, text}]}], in display order.
  // A custom field whose code is already taken by a built-in field or an earlier custom field gets no command.
  function commands(fields) {
    const list = [], taken = new Set(Object.values(builtIn));
    for (const field of fields) {
      if (excluded.has(field.id)) continue;
      let code = field.custom ? null : builtIn[field.id];
      if (!code) {
        code = field.id.toLowerCase();
        if (taken.has(code)) continue;
        taken.add(code);
      }
      list.push({ code, id: field.id, label: field.label, field, options: field.options?.filter(option => option.value !== "") });
    }
    return list;
  }
  // Returns {cmd, value} when the whole line is a known command with a value, otherwise null.
  function parseLine(text, list) {
    const match = /^\s*\/([\w-]+)\s+(\S.*?)\s*$/.exec(String(text).replace(/ /g, " "));
    if (!match) return null;
    const cmd = list.find(item => item.code === match[1].toLowerCase());
    return cmd ? { cmd, value: match[2] } : null;
  }
  // Commands whose code starts with what has been typed after "/" at the start of a line.
  function suggest(text, list) {
    const match = /^\s*\/([\w-]*)$/.exec(String(text).replace(/ /g, " "));
    if (!match) return [];
    const typed = match[1].toLowerCase();
    return list.filter(item => item.code.startsWith(typed));
  }
  // Dropdown fields take an option: exact match first, then a single prefix match, then a single partial match.
  function resolveValue(cmd, value) {
    const text = value.trim();
    if (!cmd.options) return { ok: true, value: cmd.id === "tag" ? text.toUpperCase() : text };
    const wanted = text.toLowerCase();
    const names = option => [option.value.toLowerCase(), option.text.toLowerCase()];
    const exact = cmd.options.find(option => names(option).includes(wanted));
    if (exact) return { ok: true, value: exact.value, text: exact.text };
    for (const test of [name => name.startsWith(wanted), name => name.includes(wanted)]) {
      const found = cmd.options.filter(option => names(option).some(test));
      if (found.length === 1) return { ok: true, value: found[0].value, text: found[0].text };
      if (found.length > 1) return { ok: false, reason: `"${text}" matches more than one ${cmd.label} option: ${found.map(option => option.text).join(", ")}.` };
    }
    return { ok: false, reason: `"${text}" is not a ${cmd.label} option. Choose from: ${cmd.options.map(option => option.text).join(", ")}.` };
  }
  const plainText = (cmd, shown) => `${cmd.label}: ${shown}`;
  return { builtIn, commands, parseLine, suggest, resolveValue, plainText };
})();
if (typeof module !== "undefined") module.exports = CaseSlash;
