"use strict";
// Rule-based note quality rubric for Case Notes. Pure functions, shared with the Node regression tests.
const CaseRubricCore = (() => {
  const Notes = typeof module !== "undefined" ? require("./case-notes-core.js") : CaseNotes;
  const Toolkit = typeof module !== "undefined" ? require("./case-toolkit-core.js") : CaseToolkitCore;
  const maxima = { details:25, issue:20, troubleshooting:25, evidence:15, next:15 };
  const labels = { details:"Case details", issue:"Issue clarity", troubleshooting:"Troubleshooting", evidence:"Evidence", next:"Next steps" };
  const detailFields = { request:"Service Request Number", tag:"Service Tag", platform:"System/Platform", os:"OS/Solution", osVersion:"OS version / build", country:"Customer Country", supportType:"OS Support Entitlement Verification", issue:"Issue Description" };
  const outcomeTerms = /\b(result|resulted|outcome|observed|showed|shows|returned|confirmed|persist(?:s|ed)?|resolved|fixed|failed|fails|succeeded|success(?:ful)?|same|no change|unchanged|worked|works|did not|didn't|still|error|passed|cleared)\b/i;
  const concreteTerms = /(\d|\b0x[0-9a-f]+\b|\b[A-Z]{2,}\d{2,}\b|\bv?\d+\.\d+|\b(?:event id|error|code|kb\d+|build|firmware|bios|idrac|driver)\b)/i;
  const placeholder = /\[(?:add|enter|insert|describe|assign|agree)\b[^\]]*\]/gi;

  // Plain text without template scaffolding, so applying a template alone earns no credit.
  function clean(value) {
    const html = (typeof value === "string" ? value : "").replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi, "\n");
    const text = Notes.plainText(html).replace(placeholder, "");
    return text.split(/\r?\n/).map(line => line.trim())
      .filter(line => line && !/^[-*•\d.)\s]*$/.test(line) && !/:$/.test(line) && !/^next steps$/i.test(line))
      .join("\n");
  }
  function steps(text) {
    const lines = text.split("\n").filter(line => line.length >= 8);
    return lines.length;
  }
  function score(note = {}) {
    const toolkit = note.toolkit || {}, workflow = toolkit.workflow || {};
    const categories = {}, gaps = [];
    const gap = (category, points, text) => { if (points > 0) gaps.push({ category, points, text }); };

    // Case details: one share per core field.
    const missing = Object.keys(detailFields).filter(key => !String(note[key] || "").trim());
    categories.details = Math.round(maxima.details * (Object.keys(detailFields).length - missing.length) / Object.keys(detailFields).length);
    if (missing.length) gap("details", maxima.details - categories.details, "Fill in " + missing.map(key => detailFields[key]).join(", ") + ".");

    // Issue clarity: a specific description, impact, and what changed.
    const issue = clean(note.issue);
    let issueScore = 0;
    if (issue.length >= 40) issueScore += 6; else gap("issue", 6, "Describe the issue in at least a full sentence: what fails, where, and for whom.");
    if (issue.length >= 120) issueScore += 4; else if (issue.length >= 40) gap("issue", 4, "Add scope to the issue description: affected component, frequency, and when it started.");
    if (concreteTerms.test(issue)) issueScore += 4; else gap("issue", 4, "Include concrete details in the issue: exact error, code, version, or count.");
    if (String(toolkit.impact || "").trim() || (workflow.severity && workflow.severity !== "Unspecified")) issueScore += 3; else gap("issue", 3, "Set Service impact in Triage or record the business impact.");
    if (String(workflow.recentChange || "").trim()) issueScore += 3; else gap("issue", 3, "Record the recent change in Triage, or note that none is known.");
    categories.issue = issueScore;

    // Troubleshooting: distinct actions with their observed outcomes.
    const notes = clean(note.notes);
    let troubleScore = 0;
    if (notes.length >= 80) troubleScore += 6; else gap("troubleshooting", 6, "Document what you checked or changed in Notes.");
    if (steps(notes) >= 2) troubleScore += 7; else gap("troubleshooting", 7, "List troubleshooting as separate steps (at least two).");
    if (outcomeTerms.test(notes)) troubleScore += 7; else gap("troubleshooting", 7, "Record the observed result of each troubleshooting step.");
    if (concreteTerms.test(notes)) troubleScore += 5; else gap("troubleshooting", 5, "Add specifics to Notes: error codes, versions, timestamps, or host names.");
    categories.troubleshooting = troubleScore;

    // Evidence: where it lives and what has been reviewed.
    let evidenceScore = 0;
    if (String(note.logLocation || "").trim()) evidenceScore += 7; else gap("evidence", 7, "Record the Log Location for collected evidence.");
    let list = [];
    try { list = Toolkit.checklist(note); } catch { list = []; }
    const checks = toolkit.checks || {}, reviewed = list.filter(item => checks[item.id]).length;
    const findings = Object.values(workflow.results || {}).some(value => String(value).trim());
    if (reviewed >= 1 || findings) evidenceScore += 4; else gap("evidence", 4, "Mark reviewed evidence under Evidence in the case workflow.");
    if (list.length && reviewed * 2 >= list.length) evidenceScore += 4; else gap("evidence", 4, "Review at least half of the suggested evidence items.");
    categories.evidence = evidenceScore;

    // Next steps: a clear plan with an owner or due date.
    const next = clean(note.next);
    let nextScore = 0;
    if (next.length >= 15) nextScore += 6; else gap("next", 6, "Write the Action Plan / Next Steps.");
    if (steps(next) >= 2 || next.length >= 80) nextScore += 4; else if (next.length >= 15) gap("next", 4, "Break the action plan into specific steps.");
    if (String(toolkit.owner || "").trim() || String(toolkit.due || "").trim() || toolkit.status === "Completed") nextScore += 5; else gap("next", 5, "Set a follow-up owner or due date.");
    categories.next = nextScore;

    const total = Object.values(categories).reduce((sum, value) => sum + value, 0);
    const rating = total >= 85 ? "Strong" : total >= 60 ? "Needs detail" : "Incomplete";
    gaps.sort((a, b) => b.points - a.points);
    return { total, rating, categories, maxima, labels, gaps };
  }
  return { maxima, labels, score, clean };
})();
if (typeof module !== "undefined") module.exports = CaseRubricCore;
