// Guided troubleshooting decision trees. Workflows are plain data registered by troubleshoot-data-*.js files.
const TroubleshootCore = (() => {
  const osList = [
    { id: "windows-server", label: "Windows Server" }
  ];
  const areas = [
    { id: "windows-server", label: "Windows Server" },
    { id: "hyperv", label: "Hyper-V" },
    { id: "cluster", label: "Failover Clustering" },
    { id: "networking", label: "Networking" },
    { id: "ad", label: "Active Directory" },
    { id: "dns", label: "DNS" }
  ];
  // Case Notes issue types (case-toolkit-core.js templates) mapped to troubleshooting areas.
  const issueAreas = { boot: "windows-server", crash: "windows-server", performance: "windows-server", updates: "windows-server", network: "networking", smb: "networking", directory: "ad", hyperv: "hyperv", cluster: "cluster" };
  const handoffKey = "dell-support.troubleshoot-handoff.v1";
  const handoffMaxAge = 24 * 60 * 60 * 1000;
  const workflows = [];
  const isText = value => typeof value === "string" && value.trim().length > 0;
  const isUrl = value => typeof value === "string" && /^https:\/\/[^\s]+$/.test(value);

  function validate(workflow) {
    const errors = [];
    const fail = message => errors.push(`${workflow?.id || "workflow"}: ${message}`);
    if (!workflow || typeof workflow !== "object") return ["workflow: not an object"];
    if (!/^[a-z0-9-]+$/.test(workflow.id || "")) fail("id must be lowercase letters, numbers and dashes");
    for (const field of ["title", "summary", "reviewed", "start"]) if (!isText(workflow[field])) fail(`missing ${field}`);
    if (!Array.isArray(workflow.os) || !workflow.os.length || workflow.os.some(os => !osList.some(item => item.id === os))) fail("unknown os");
    if (!areas.some(area => area.id === workflow.area)) fail("unknown area");
    if (!Array.isArray(workflow.sources) || !workflow.sources.length || !workflow.sources.every(isUrl)) fail("sources must be https links");
    const steps = workflow.steps && typeof workflow.steps === "object" ? workflow.steps : {};
    if (!steps[workflow.start]) fail("start step missing");
    for (const [id, step] of Object.entries(steps)) {
      if (step.outcome) {
        const outcome = step.outcome;
        if (!isText(outcome.cause)) fail(`${id}: outcome needs a cause`);
        if (!Array.isArray(outcome.fix) || !outcome.fix.length || !outcome.fix.every(isText)) fail(`${id}: outcome needs fix steps`);
        if (outcome.links && !outcome.links.every(isUrl)) fail(`${id}: outcome links must be https`);
        continue;
      }
      if (!isText(step.prompt)) fail(`${id}: missing prompt`);
      if (step.commands && (!Array.isArray(step.commands) || !step.commands.every(isText))) fail(`${id}: commands must be text`);
      if (!Array.isArray(step.answers) || step.answers.length < 2) fail(`${id}: needs at least two answers`);
      for (const answer of step.answers || []) {
        if (!isText(answer.label)) fail(`${id}: answer missing label`);
        if (!steps[answer.next]) fail(`${id}: answer "${answer.label}" points to missing step ${answer.next}`);
      }
    }
    // Every path from start must end at an outcome without looping, and every step must be reachable.
    const reached = new Set();
    const walk = (id, trail) => {
      if (trail.includes(id)) { fail(`cycle at ${id}`); return; }
      const step = steps[id]; if (!step) return;
      reached.add(id);
      if (!step.outcome) for (const answer of step.answers || []) walk(answer.next, [...trail, id]);
    };
    if (steps[workflow.start]) walk(workflow.start, []);
    for (const id of Object.keys(steps)) if (!reached.has(id)) fail(`${id} is unreachable`);
    return errors;
  }

  function register(workflow) {
    const errors = validate(workflow);
    if (workflows.some(item => item.id === workflow?.id)) errors.push(`${workflow.id}: duplicate id`);
    if (errors.length) throw new Error(errors.join("\n"));
    workflows.push(workflow);
    return workflow;
  }

  function list({ os = "", area = "", query = "" } = {}) {
    const terms = String(query).toLowerCase().split(/\s+/).filter(Boolean);
    return workflows.filter(workflow => {
      if (os && !workflow.os.includes(os)) return false;
      if (area && workflow.area !== area) return false;
      const haystack = `${workflow.title} ${workflow.summary} ${areaLabel(workflow.area)}`.toLowerCase();
      return terms.every(term => haystack.includes(term));
    });
  }

  const find = id => workflows.find(workflow => workflow.id === id) || null;
  const areaLabel = id => areas.find(area => area.id === id)?.label || id;

  // path is a list of {step, answer} choices; the final step is resolved from the last answer.
  function text(workflow, path) {
    const lines = [`Troubleshooting guide: ${workflow.title} (${areaLabel(workflow.area)})`];
    path.forEach((choice, index) => {
      const step = workflow.steps[choice.step];
      const answer = step?.answers?.[choice.answer];
      if (step && answer) lines.push(`${index + 1}. ${step.prompt} → ${answer.label}`);
    });
    const last = path.length ? workflow.steps[workflow.steps[path.at(-1).step]?.answers?.[path.at(-1).answer]?.next] : workflow.steps[workflow.start];
    if (last?.outcome) {
      lines.push(`Likely cause: ${last.outcome.cause}`);
      lines.push("Recommended actions:");
      last.outcome.fix.forEach(fix => lines.push(`- ${fix}`));
      (last.outcome.links || []).forEach(link => lines.push(`Reference: ${link}`));
    }
    return lines.join("\n");
  }

  function handoff(title, body, now = Date.now()) {
    return JSON.stringify({ title: String(title).slice(0, 200), text: String(body).slice(0, 20000), created: now });
  }

  function readHandoff(raw, now = Date.now()) {
    try {
      const value = JSON.parse(raw);
      if (!value || !isText(value.text) || typeof value.created !== "number") return null;
      if (now - value.created > handoffMaxAge || value.created > now + 60000) return null;
      return { title: isText(value.title) ? value.title : "Troubleshooting results", text: value.text, created: value.created };
    } catch { return null; }
  }

  return { osList, areas, issueAreas, handoffKey, register, validate, list, find, areaLabel, text, handoff, readHandoff, all: () => workflows.slice() };
})();
if (typeof module !== "undefined") module.exports = TroubleshootCore;
