// Saves a case history in the format written by one version of Case Notes, so later versions can be tested
// against it (tests/history-compatibility.test.cjs). Run it at each release that changes what Case Notes saves:
//   node scripts/make-history-fixture.cjs js tests/fixtures/history/2026-10-14-current.json
// The first argument is the folder holding that version's *-core.js files. Each enrichment uses only the
// functions that version had, so the same script also works for older versions extracted from git.
"use strict";
const fs = require("node:fs"), path = require("node:path");
const [dir, out] = process.argv.slice(2);
if (!dir || !out) { console.error("Usage: node scripts/make-history-fixture.cjs <folder with *-core.js> <output.json>"); process.exit(1); }
const load = name => { const file = path.resolve(dir, name); return fs.existsSync(file) ? require(file) : null; };
const C = load("case-notes-core.js"), T = load("case-toolkit-core.js"), W = load("case-workflow-core.js");
if (!C) { console.error("No case-notes-core.js in " + dir); process.exit(1); }
const day = d => Date.parse(`2026-09-${String(d).padStart(2, "0")}T09:00:00Z`);
const tryStep = (name, step) => { try { step(); return name; } catch { return null; } };
const state = C.empty(), done = [];

const notes = [
  { id: "case-a", request: "100000001", tag: "AAA1001", issue: "VMs lose network for 30-90 seconds", notes: "<p>Spoke with the customer. Result: drops reproduced.</p>", next: "<p>Customer to collect a TSR. Owner: customer. Due: tomorrow.</p>" },
  { id: "case-b", request: "100000002", tag: "BBB2002", issue: "Server restarts unexpectedly", notes: "<p>Reviewed the System log. Observed Event ID 41.</p>", next: "" },
  { id: "case-c", request: "100000003", tag: "CCC3003", issue: "Archived example", notes: "<p>Old case.</p>", next: "" },
  { id: "case-d", request: "100000004", tag: "DDD4004", issue: "Deleted example", notes: "<p>Deleted case.</p>", next: "" }
];
notes.forEach((data, index) => {
  const note = C.create(state, data.id, day(10 + index));
  for (const [key, value] of Object.entries(data)) if (key !== "id" && key in note) note[key] = value;
  if ("platform" in note) note.platform = "PowerEdge R750";
  if ("os" in note) note.os = "Windows Server";
});
const [a, b] = ["case-a", "case-b"].map(id => state.cases.find(note => note.id === id));
if (T?.ensure) done.push(tryStep("toolkit", () => {
  const toolkit = T.ensure(a);
  Object.assign(toolkit, { issueType: "network", owner: "Customer", due: "2026-09-21T15:00:00.000Z", status: "Waiting on customer" });
  if (Array.isArray(toolkit.timeline)) toolkit.timeline.push({ id: "t1", at: day(11), action: "Requested a TSR", result: "Customer agreed" });
}));
if (W?.ensure) done.push(tryStep("workflow", () => Object.assign(W.ensure(a), { recentChange: "NIC driver updated", fix: "Rolled the driver back" })));
if (C.addCustomField) done.push(tryStep("custom field", () => { C.addCustomField(state, "siteName", "Site name"); a.siteName = "Lab 2"; }));
if (C.addEntry) done.push(tryStep("dated notes", () => { C.addEntry(a, "day-two", day(12)); a.notes = "<p>Day two: driver rolled back. Result: no drops for 60 minutes.</p>"; C.syncEntry?.(a, day(12)); }));
if (C.checkpoint) done.push(tryStep("saved version", () => { const before = JSON.parse(JSON.stringify(state)); b.notes += "<p>Edited later.</p>"; C.checkpoint(state, before, day(13)); }));
if (C.move) {
  done.push(tryStep("archive", () => C.move(state, "case-c", "cases", "archive", day(14))));
  done.push(tryStep("trash", () => C.move(state, "case-d", "cases", "trash", day(15))));
}
const text = JSON.stringify(state);
C.parse(text); // The version that wrote it must be able to read it back.
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ writtenBy: path.basename(out, ".json"), features: done.filter(Boolean), history: state }, null, 1) + "\n");
console.log(`${out}: version ${state.version}, ${state.cases.length} cases${done.filter(Boolean).length ? ", " + done.filter(Boolean).join(", ") : ""}`);
