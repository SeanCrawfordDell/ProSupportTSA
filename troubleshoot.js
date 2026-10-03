// Guided troubleshooting page: browse workflows, walk a decision tree, then copy or send the result to Case Notes.
window.TroubleshootGuides = (() => {
  const core = TroubleshootCore;
  const $ = id => document.getElementById(id);
  const state = { os: core.osList[0].id, area: "", query: "", workflow: null, path: [] };

  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function current() {
    const { workflow, path } = state;
    if (!workflow) return null;
    if (!path.length) return { id: workflow.start, step: workflow.steps[workflow.start] };
    const last = path[path.length - 1];
    const id = workflow.steps[last.step].answers[last.answer].next;
    return { id, step: workflow.steps[id] };
  }

  function renderFilters() {
    $("tsOs").replaceChildren(...core.osList.map(os => { const option = el("option", os.label); option.value = os.id; return option; }));
    $("tsOs").value = state.os;
    const chips = [{ id: "", label: "All" }, ...core.areas].map(area => {
      const chip = el("button", area.label, "ts-chip");
      chip.type = "button";
      chip.setAttribute("aria-pressed", String(state.area === area.id));
      chip.addEventListener("click", () => { state.area = area.id; renderFilters(); renderList(); });
      return chip;
    });
    $("tsAreas").replaceChildren(...chips);
  }

  function renderList() {
    const items = core.list({ os: state.os, area: state.area, query: state.query });
    $("tsCount").textContent = `${items.length} guide${items.length === 1 ? "" : "s"}`;
    $("tsList").replaceChildren(...items.map(workflow => {
      const item = el("li");
      const button = el("button", undefined, "ts-item");
      button.type = "button";
      if (state.workflow?.id === workflow.id) button.setAttribute("aria-current", "true");
      button.append(el("span", core.areaLabel(workflow.area), "ts-item-area"), el("strong", workflow.title), el("span", workflow.summary, "ts-item-summary"));
      button.addEventListener("click", () => start(workflow.id));
      item.append(button);
      return item;
    }));
  }

  function renderRunner() {
    const { workflow, path } = state;
    $("tsEmpty").hidden = !!workflow;
    $("tsActive").hidden = !workflow;
    if (!workflow) return;
    $("tsArea").textContent = core.areaLabel(workflow.area).toUpperCase();
    $("tsTitle").textContent = workflow.title;
    $("tsSummary").textContent = workflow.summary;
    $("tsTrail").replaceChildren(...path.map(choice => {
      const step = workflow.steps[choice.step];
      const item = el("li");
      item.append(el("span", step.prompt), el("strong", step.answers[choice.answer].label));
      return item;
    }));
    const { step } = current();
    const outcome = step.outcome;
    $("tsStep").hidden = !!outcome;
    $("tsOutcome").hidden = !outcome;
    if (outcome) {
      $("tsCause").textContent = outcome.cause;
      $("tsFixes").replaceChildren(...outcome.fix.map(fix => el("li", fix)));
      $("tsLinks").replaceChildren(...(outcome.links || []).map(link));
    } else {
      $("tsPrompt").textContent = step.prompt;
      $("tsDetail").textContent = step.detail || "";
      $("tsDetail").hidden = !step.detail;
      $("tsCommands").replaceChildren(...(step.commands || []).map(command));
      $("tsAnswers").replaceChildren(...step.answers.map((answer, index) => {
        const button = el("button", answer.label, "button secondary ts-answer");
        button.type = "button";
        button.addEventListener("click", () => choose(index));
        return button;
      }));
    }
    $("tsBack").disabled = !path.length;
    $("tsStatus").textContent = "";
    $("tsReviewed").textContent = workflow.reviewed;
    $("tsSources").replaceChildren(...workflow.sources.map(link));
  }

  function link(url) {
    const anchor = el("a", url.replace(/^https:\/\/learn\.microsoft\.com\/en-us\//, "learn.microsoft.com/").replace(/\?.*$/, ""));
    anchor.href = url; anchor.target = "_blank"; anchor.rel = "noopener noreferrer";
    const item = el("li"); item.append(anchor);
    return item;
  }

  function command(text) {
    const row = el("div", undefined, "ts-command");
    const code = el("code", text);
    const copy = el("button", "Copy", "ts-copy-command");
    copy.type = "button";
    copy.setAttribute("aria-label", `Copy command: ${text}`);
    copy.addEventListener("click", async () => { copy.textContent = await writeClipboard(text) ? "Copied" : "Copy failed"; });
    row.append(code, copy);
    return row;
  }

  async function writeClipboard(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  }

  function setHash(value) {
    try { history.replaceState(null, "", value ? `#${value}` : location.pathname + location.search); } catch { /* Not available in every context. */ }
  }

  function start(id) {
    const workflow = core.find(id);
    if (!workflow) return;
    state.workflow = workflow; state.path = [];
    setHash(`wf=${workflow.id}`);
    renderList(); renderRunner();
    $("tsTitle").focus?.();
  }

  function choose(index) {
    const { id, step } = current();
    if (step.outcome || !step.answers[index]) return;
    state.path.push({ step: id, answer: index });
    renderRunner();
    $("tsPrompt").focus?.();
  }

  function summary() { return core.text(state.workflow, state.path); }

  async function copySummary() {
    $("tsStatus").textContent = await writeClipboard(summary()) ? "Summary copied." : "Copy failed. Select the steps and copy them manually.";
  }

  function send() {
    try {
      localStorage.setItem(core.handoffKey, core.handoff(state.workflow.title, summary()));
    } catch {
      $("tsStatus").textContent = "This browser blocked local storage. Use Copy summary instead.";
      return;
    }
    $("tsStatus").textContent = "Sent. Opening Case Notes…";
    location.assign("case-notes.html");
  }

  function fromHash() {
    const params = new URLSearchParams(String(location.hash || "").replace(/^#/, ""));
    const area = params.get("area");
    if (area && core.areas.some(item => item.id === area)) state.area = area;
    if (params.get("wf") && core.find(params.get("wf"))) { state.workflow = core.find(params.get("wf")); state.path = []; }
  }

  function init() {
    fromHash();
    renderFilters(); renderList(); renderRunner();
    $("tsOs").addEventListener("change", event => { state.os = event.target.value; renderList(); });
    $("tsSearch").addEventListener("input", event => { state.query = event.target.value; renderList(); });
    $("tsBack").addEventListener("click", () => { state.path.pop(); renderRunner(); });
    $("tsRestart").addEventListener("click", () => { state.path = []; renderRunner(); });
    $("tsCopy").addEventListener("click", copySummary);
    $("tsSend").addEventListener("click", send);
    $("tsTitle").tabIndex = -1;
    $("tsPrompt").tabIndex = -1;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
  return { start, choose, summary, state };
})();
