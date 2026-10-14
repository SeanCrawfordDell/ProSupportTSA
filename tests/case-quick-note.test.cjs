const test = require("node:test"), assert = require("node:assert");
const CaseNotes = require("../js/case-notes-core.js");
test("quick notes round-trip and toggle", () => {
  const state = CaseNotes.empty();
  const note = CaseNotes.create(state, "q1", 1000, { quick: true });
  assert.equal(note.quick, true);
  assert.equal(CaseNotes.create(state, "q2", 2000).quick, undefined);
  CaseNotes.setQuick(note, false, 3000);
  assert.equal(note.quick, false);
  const parsed = CaseNotes.parse(JSON.stringify(state));
  assert.equal(parsed.cases.find(c => c.id === "q1").quick, false);
  assert.deepEqual(CaseNotes.quickFieldIds, ["request", "tag", "notes", "next"]);
});
test("invalid quick flag is rejected", () => {
  const state = CaseNotes.empty();
  CaseNotes.create(state, "q1", 1000).quick = "yes";
  assert.throws(() => CaseNotes.parse(JSON.stringify(state)));
});
