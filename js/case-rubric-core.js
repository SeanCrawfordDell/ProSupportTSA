"use strict";
// Rule-based note quality rubric for Case Notes. Pure functions, shared with the Node regression tests.
const CaseRubricCore = (() => {
  const Notes = typeof module !== "undefined" ? require("./case-notes-core.js") : CaseNotes;
  const Toolkit = typeof module !== "undefined" ? require("./case-toolkit-core.js") : CaseToolkitCore;
  const maxima = { details:25, issue:14, triage:6, troubleshooting:25, evidence:15, next:15 };
  const labels = { details:"Case details", issue:"Issue clarity", triage:"Triage", troubleshooting:"Troubleshooting", evidence:"Evidence", next:"Next steps" };
  const detailFields = { request:"Service Request Number", tag:"Service Tag", platform:"System/Platform", os:"OS/Solution", osVersion:"OS version / build", country:"Customer Country", supportType:"OS Support Entitlement Verification" };
  // Light format checks: a value that does not look like the field earns half credit.
  const formats = {
    tag: { test: value => /^[A-Za-z0-9]{5,10}$/.test(value), text: "Service Tag should be 5–10 letters and digits (for example ABC1234)." },
    request: { test: value => (value.match(/\d/g) || []).length >= 6, text: "Service Request Number should contain at least 6 digits." },
    osVersion: { test: value => /\d/.test(value), text: "OS version / build should include the version or build number." }
  };
  const logLocationFormat = value => /^(?:https?|file):\/\/\S+/i.test(value) || /^\\\\\S+/.test(value) || /^[A-Za-z]:\\/.test(value) || /^\/\S+/.test(value);
  const outcomeTerms = /\b(result|resulted|outcome|observed|showed|shows|returned|confirmed|persist(?:s|ed)?|resolved|fixed|failed|fails|succeeded|success(?:ful)?|same|no change|unchanged|worked|works|did not|didn't|still|error|passed|cleared)\b/i;
  const concreteTerms = /(\d|\b0x[0-9a-f]+\b|\b[A-Z]{2,}\d{2,}\b|\bv?\d+\.\d+|\b(?:event id|error|code|kb\d+|build|firmware|bios|idrac|driver)\b)/i;
  // Impact, change, and ownership written inside the free text count the same as the Triage / Handoff / Follow-up dialogs.
  const impactTerms = /\b(impact|affected|users?|production|down|degraded|blocked)\b/i;
  const changeTerms = /\b(chang|updat|upgrad|patch|migrat|since|after)\w*/i;
  const ownerTerms = /\b(owner|assigned|assign|follow[- ]?up|due|deadline|call ?back|schedule[ds]?|\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2})\b/i;
  const placeholder = /\[(?:add|enter|insert|describe|assign|agree)\b[^\]]*\]/gi;

  // Text plausibility. app.js keeps an identical copy because the Escalation page loads without this module.
  const text = (() => {
    const placeholderText = /\b(?:lorem ipsum|dolor sit amet|consectetur|adipiscing|asdf|qwerty)\b/i;
    const markers = /^\s*(?:\d+[.)]|[-*•])\s*/gm;
    // Whitespace tokens with edge punctuation removed, so versions and addresses such as 7.10.20.00 or 10.0.0.5 stay whole.
    const tokens = value => String(value || "").toLowerCase().replace(markers, "").split(/\s+/).map(token => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")).filter(Boolean);
    const sentences = value => String(value || "").toLowerCase().replace(markers, "").split(/[!?\n]+|\.(?!\d)/).map(part => tokens(part).join(" ")).filter(Boolean);
    // Repeated words, repeated sentences, or placeholder text. The word ratio is measured over the first 80 words so long real notes are not penalised.
    function filler(value) {
      const raw = String(value || "");
      if (placeholderText.test(raw)) return true;
      const list = tokens(raw);
      if (list.length >= 8) {
        const window = list.slice(0, 80);
        if (new Set(window).size / window.length < 0.5 || new Set(list).size < 5) return true;
      }
      const lines = sentences(raw);
      return lines.length >= 3 && new Set(lines).size / lines.length <= 0.5;
    }
    // Jaccard similarity of the token sets; short values never count as duplicates.
    function similarity(a, b) {
      const left = new Set(tokens(a)), right = new Set(tokens(b));
      if (left.size < 4 || right.size < 4) return 0;
      let shared = 0;
      for (const token of left) if (right.has(token)) shared++;
      return shared / (left.size + right.size - shared);
    }
    const duplicate = (a, b) => similarity(a, b) >= 0.8;
    const lines = value => String(value || "").split(/\r?\n/).map(line => line.replace(markers, "").trim()).filter(Boolean);
    return { tokens, filler, similarity, duplicate, lines };
  })();

  // Prompt labels from the former note templates never count as content, with or without a short answer after the colon.
  const promptLabels = new Set(["action", "owner", "follow-up"]);
  for (const item of Object.values(Toolkit.issueTypes)) for (const prompt of item.prompts) promptLabels.add(prompt.toLowerCase());

  // Plain text without template scaffolding, so notes holding only the old prompts earn no credit.
  function clean(value) {
    const html = (typeof value === "string" ? value : "").replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi, "\n");
    const plain = Notes.plainText(html).replace(placeholder, "");
    return plain.split(/\r?\n/).map(line => line.trim()).map(line => {
      const match = /^([^:]{2,80}):\s*(.*)$/.exec(line);
      if (match && promptLabels.has(match[1].trim().toLowerCase())) return match[2].trim().length > 3 ? match[2].trim() : "";
      return line;
    }).filter(line => line && !/^[-*•\d.)\s]*$/.test(line) && !/:$/.test(line) && !/^next steps$/i.test(line)).join("\n");
  }
  const stepLines = value => value.split("\n").filter(line => line.length >= 8);
  // Every dated entry counts, so earlier days keep their credit when a short follow-up entry is active.
  function entriesText(note, field) {
    let entries;
    try { entries = Notes.entryList(note); } catch { entries = [{ [field]: note[field] }]; }
    return entries.map(entry => clean(entry[field])).filter(Boolean).join("\n");
  }
  function score(note = {}) {
    const toolkit = note.toolkit || {}, workflow = toolkit.workflow || {};
    const categories = {}, gaps = [];
    const gap = (category, points, message, blocking = false) => { if (points > 0) gaps.push({ category, points, text: message, blocking }); };

    // Case details: one share per core field, half when the value does not match the field's format.
    const keys = Object.keys(detailFields), share = maxima.details / keys.length;
    const missing = [], malformed = [];
    let detailScore = 0;
    for (const key of keys) {
      const value = String(note[key] || "").trim();
      if (!value) { missing.push(key); continue; }
      if (formats[key] && !formats[key].test(value)) { malformed.push(key); detailScore += share / 2; } else detailScore += share;
    }
    categories.details = Math.round(detailScore);
    if (missing.length) gap("details", Math.round(missing.length * share), "Fill in " + missing.map(key => detailFields[key]).join(", ") + ".");
    for (const key of malformed) gap("details", Math.round(share / 2), formats[key].text);

    // Scored free text. A field that repeats an earlier one earns no credit; the first copy keeps it.
    const issue = clean(note.issue), notes = entriesText(note, "notes"), next = entriesText(note, "next");
    const impactText = String(toolkit.impact || "").trim(), changeText = String(workflow.recentChange || "").trim();
    const texts = [["issue", "Issue Description", issue], ["notes", "Notes", notes], ["next", "Action Plan / Next Steps", next], ["impact", "Business impact", impactText], ["recentChange", "Recent change", changeText]];
    const filler = Object.fromEntries(texts.map(([key, , value]) => [key, !!value && text.filler(value)]));
    const repeats = {};
    texts.forEach(([key, , value], index) => {
      if (!value || filler[key]) return;
      const source = texts.slice(0, index).find(([other, , otherValue]) => otherValue && !filler[other] && !repeats[other] && text.duplicate(value, otherValue));
      if (source) repeats[key] = source[1];
    });
    // Usable text is present, at least a short word long, not filler, and not a copy of an earlier field.
    const usable = key => texts.find(([id]) => id === key)[2].length >= 3 && !filler[key] && !repeats[key];

    // Issue clarity: a specific description with concrete detail.
    let issueScore = 0;
    if (filler.issue) gap("issue", maxima.issue, "Issue Description reads as repeated or placeholder text. Describe the actual failure.", true);
    else {
      if (issue.length >= 40) issueScore += 6; else gap("issue", 6, "Describe the issue in at least a full sentence: what fails, where, and for whom.");
      if (issue.length >= 120) issueScore += 4; else if (issue.length >= 40) gap("issue", 4, "Add scope to the issue description: affected component, frequency, and when it started.");
      if (concreteTerms.test(issue)) issueScore += 4; else gap("issue", 4, "Include concrete details in the issue: exact error, code, version, or count.");
    }
    categories.issue = issueScore;

    // Triage: service impact and what changed, from the dialogs or written into the issue text.
    let triageScore = 0;
    const severitySet = workflow.severity && workflow.severity !== "Unspecified";
    const impactNote = filler.impact ? "Business impact reads as repeated or placeholder text." : repeats.impact ? `Business impact repeats the ${repeats.impact}.` : "";
    if (usable("impact") || severitySet || (usable("issue") && impactTerms.test(issue))) triageScore += 3;
    else gap("triage", 3, impactNote || "Set Service Impact in Triage, record the Business impact under Handoff Summary, or state who is affected in the Issue Description.", !!impactNote);
    const changeNote = filler.recentChange ? "Recent change reads as repeated or placeholder text." : repeats.recentChange ? `Recent change repeats the ${repeats.recentChange}.` : "";
    if (usable("recentChange") || (usable("issue") && changeTerms.test(issue))) triageScore += 3;
    else gap("triage", 3, changeNote || "Record the recent change in Triage or in the Issue Description, or note that none is known.", !!changeNote);
    categories.triage = triageScore;

    // Troubleshooting: distinct steps, each paired with its observed outcome.
    let troubleScore = 0;
    if (filler.notes) gap("troubleshooting", maxima.troubleshooting, "Notes reads as repeated or placeholder text. Record the real steps and their results.", true);
    else if (repeats.notes) gap("troubleshooting", maxima.troubleshooting, `Notes repeats the ${repeats.notes}. Record the troubleshooting steps and outcomes separately.`, true);
    else {
      if (notes.length >= 80) troubleScore += 6; else gap("troubleshooting", 6, "Document what you checked or changed in Notes.");
      const lines = stepLines(notes);
      if (lines.length >= 2) troubleScore += 7; else gap("troubleshooting", 7, "List troubleshooting as separate steps (at least two).");
      const withOutcome = lines.filter(line => outcomeTerms.test(line)).length;
      const outcomePoints = lines.length ? Math.round(7 * Math.min(1, (withOutcome / lines.length) / 0.5)) : 0;
      troubleScore += outcomePoints;
      if (outcomePoints < 7) gap("troubleshooting", 7 - outcomePoints, lines.length ? `Record the observed result of each troubleshooting step (${withOutcome} of ${lines.length} have one).` : "Record the observed result of each troubleshooting step.", lines.length > 0);
      if (concreteTerms.test(notes)) troubleScore += 5; else gap("troubleshooting", 5, "Add specifics to Notes: error codes, versions, timestamps, or host names.");
    }
    categories.troubleshooting = troubleScore;

    // Evidence: where it lives and what has been reviewed.
    let evidenceScore = 0;
    const location = String(note.logLocation || "").trim();
    if (!location) gap("evidence", 7, "Record the Log Location for collected evidence.");
    else if (logLocationFormat(location)) evidenceScore += 7;
    else { evidenceScore += 4; gap("evidence", 3, "Log Location should be a link, UNC path, or absolute path to the collected evidence."); }
    let list = [];
    try { list = Toolkit.checklist(note); } catch { list = []; }
    const checks = toolkit.checks || {}, reviewed = list.filter(item => checks[item.id]).length;
    const findings = Object.values(workflow.results || {}).some(value => String(value).trim());
    if (reviewed >= 1 || findings) evidenceScore += 4; else gap("evidence", 4, "Mark reviewed evidence under Evidence in the case workflow.");
    if (list.length && reviewed * 2 >= list.length) evidenceScore += 4; else gap("evidence", 4, "Review at least half of the suggested evidence items.");
    categories.evidence = evidenceScore;

    // Next steps: a clear plan with an owner or due date.
    let nextScore = 0;
    if (filler.next) gap("next", maxima.next, "Action Plan / Next Steps reads as repeated or placeholder text. Write the real plan.", true);
    else if (repeats.next) gap("next", maxima.next, `Action Plan / Next Steps repeats the ${repeats.next}. Write what happens next, not what already happened.`, true);
    else {
      if (next.length >= 15) nextScore += 6; else gap("next", 6, "Write the Action Plan / Next Steps.");
      if (stepLines(next).length >= 2 || next.length >= 80) nextScore += 4; else if (next.length >= 15) gap("next", 4, "Break the action plan into specific steps.");
      if (String(toolkit.owner || "").trim() || String(toolkit.due || "").trim() || toolkit.status === "Completed" || ownerTerms.test(next)) nextScore += 5;
      else gap("next", 5, "Set a follow-up owner or due date, or name the owner and date in the Action Plan.");
    }
    categories.next = nextScore;

    const total = Object.values(categories).reduce((sum, value) => sum + value, 0);
    // Placeholder or repeated text and steps without outcomes keep a note below Strong whatever the total.
    const blocking = gaps.some(item => item.blocking);
    const rating = total >= 85 && !blocking ? "Strong" : total >= 60 ? "Needs detail" : "Incomplete";
    gaps.sort((a, b) => b.points - a.points);
    return { total, rating, categories, maxima, labels, gaps, blocking };
  }
  return { maxima, labels, score, clean, text };
})();
if (typeof module !== "undefined") module.exports = CaseRubricCore;
