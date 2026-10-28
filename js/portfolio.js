"use strict";
// Tool Portfolio page: summary, stage bar and three views (Portfolio table, Pipeline board, Who owns what) of the
// tools listed in js/portfolio-data.js. Everything is built with DOM methods, so catalog text is never parsed as HTML.
(() => {
  const P = window.PortfolioCore, data = window.PortfolioData || { tools: [] };
  const $ = id => document.getElementById(id);
  const staleDays = Number.isInteger(data.staleDays) && data.staleDays > 0 ? data.staleDays : 7;
  const views = ["portfolio", "pipeline", "owners"];
  const state = { view: "portfolio", group: "Health", query: "" };
  const tools = (Array.isArray(data.tools) ? data.tools : []).map(P.normalize);
  const owners = P.owners(tools).map(o => o.name);

  const el = (tag, className, textValue) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (textValue !== undefined) node.textContent = textValue;
    return node;
  };
  const slug = value => value.toLowerCase().replace(/[^a-z]+/g, "-");
  const healthPill = tool => el("span", "pill health-" + slug(tool.health), tool.health);
  const stagePill = tool => el("span", "pill stage stage-" + slug(tool.stage), tool.stage);
  function avatar(name) {
    const index = owners.indexOf(name);
    const node = el("span", "avatar " + (name === P.unassigned ? "avatar-none" : "avatar-" + (index % 8)), P.initials(name));
    node.setAttribute("aria-hidden", "true");
    return node;
  }
  function progress(tool, compact) {
    const wrap = el("div", "progress"), bar = el("div", "bar"), fill = el("span");
    fill.style.width = P.percent(tool) + "%";
    bar.append(fill);
    bar.setAttribute("role", "img");
    bar.setAttribute("aria-label", `${tool.tasksDone} of ${tool.tasksTotal} tasks done`);
    wrap.append(bar, el("span", "progress-label", tool.tasksTotal ? `${tool.tasksDone} / ${tool.tasksTotal}${compact ? " tasks" : " · " + P.percent(tool) + "%"}` : "No tasks yet"));
    return wrap;
  }
  function toolName(tool) {
    const wrap = el("div", "tool-name");
    const title = tool.link ? el("a", "", tool.name) : el("strong", "", tool.name);
    if (tool.link) { title.href = tool.link; title.target = "_blank"; title.rel = "noopener noreferrer"; }
    wrap.append(title);
    if (tool.category) wrap.append(el("span", "muted small", tool.category));
    return wrap;
  }

  function renderSummary() {
    const s = P.summary(tools, staleDays);
    $("metricTotal").textContent = s.total;
    $("metricOn").textContent = s.onTrack;
    $("metricRisk").textContent = s.atRisk;
    $("metricOff").textContent = s.offTrack;
    $("metricStale").textContent = s.stale;
    const bar = $("stageBar"), legend = $("stageLegend");
    bar.replaceChildren(...s.stages.filter(x => x.count).map(x => { const seg = el("span", "seg stage-" + slug(x.name)); seg.style.flexGrow = x.count; seg.title = `${x.name}: ${x.count}`; return seg; }));
    legend.replaceChildren(...s.stages.map(x => { const item = el("li", "legend-item"); item.append(el("span", "dot stage-" + slug(x.name)), document.createTextNode(`${x.name} `), el("strong", "", String(x.count))); return item; }));
  }

  function renderTable(list) {
    const table = el("table", "portfolio-table");
    const head = el("thead"), row = el("tr");
    for (const label of ["Tool", "Owner", "Stage", "Health", "Progress", "Target", "Status note", "Updated"]) { const th = el("th", "", label); th.scope = "col"; row.append(th); }
    head.append(row);
    table.append(head);
    for (const group of P.groups(list, state.group)) {
      const body = el("tbody"), groupRow = el("tr", "group-row"), th = el("th");
      th.colSpan = 8; th.scope = "rowgroup";
      th.append(state.group === "Health" ? el("span", "dot health-" + slug(group.name)) : state.group === "Stage" ? el("span", "dot stage-" + slug(group.name)) : avatar(group.name), document.createTextNode(group.name + " "), el("span", "count", String(group.tools.length)));
      groupRow.append(th);
      body.append(groupRow);
      for (const tool of group.tools) {
        const tr = el("tr"), stale = P.stale(tool, staleDays);
        const owner = el("td"); owner.append(el("span", "owner", ""));
        owner.firstChild.append(avatar(tool.owner), document.createTextNode(tool.owner));
        const cells = [toolName(tool), null, stagePill(tool), healthPill(tool), progress(tool), el("span", "", tool.target || "—"), el("span", "note", tool.note || "—"), el("span", stale ? "updated stale" : "updated muted", P.updatedLabel(tool) + (stale ? " · stale" : ""))];
        cells.forEach((cell, i) => { if (i === 1) { tr.append(owner); return; } const td = el("td"); td.append(cell); tr.append(td); });
        body.append(tr);
      }
      table.append(body);
    }
    return table;
  }

  function renderBoard(list) {
    const board = el("div", "board");
    for (const column of P.columns(list)) {
      const section = el("section", "board-column"), head = el("div", "column-head"), title = el("h3");
      title.append(el("span", "dot stage-" + slug(column.name)), document.createTextNode(column.name + " "), el("span", "count", String(column.tools.length)));
      head.append(title);
      if (column.attention) head.append(el("span", "muted small", `${column.attention} need attention`));
      section.append(head);
      if (!column.tools.length) section.append(el("p", "muted small column-empty", "No tools"));
      for (const tool of column.tools) {
        const card = el("article", "tool-card-mini health-edge-" + slug(tool.health)), meta = el("div", "card-meta");
        meta.append(healthPill(tool), avatar(tool.owner));
        meta.lastChild.title = tool.owner;
        card.append(toolName(tool), meta, progress(tool, true));
        if (tool.target) card.append(el("span", "muted small", "Target " + tool.target));
        section.append(card);
      }
      board.append(section);
    }
    return board;
  }

  function renderOwners(list) {
    const grid = el("div", "owner-grid");
    for (const owner of P.owners(list)) {
      const card = el("section", "owner-card"), head = el("div", "owner-head"), who = el("div");
      who.append(el("h3", "", owner.name), el("span", "muted small", `${owner.tools.length} tool${owner.tools.length === 1 ? "" : "s"} · ${owner.openTasks} open tasks`));
      head.append(avatar(owner.name), who);
      const counts = el("div", "owner-counts");
      counts.append(el("span", "pill health-on-track", `${owner.on} on track`), el("span", "pill health-at-risk", `${owner.risk} at risk`), el("span", "pill health-off-track", `${owner.off} off track`));
      const items = el("ul", "owner-tools");
      for (const tool of owner.tools) {
        const item = el("li"), top = el("div", "owner-tool-top"), name = el("span", "owner-tool-name");
        name.append(el("span", "dot health-" + slug(tool.health)), document.createTextNode(tool.name));
        top.append(name, stagePill(tool));
        item.append(top, progress(tool));
        items.append(item);
      }
      card.append(head, counts, items);
      grid.append(card);
    }
    return grid;
  }

  function render() {
    const list = tools.filter(tool => P.matches(tool, state.query));
    for (const view of views) {
      const tab = $("tab-" + view), panel = $("panel-" + view), selected = view === state.view;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panel.hidden = !selected;
    }
    $("groupControl").hidden = state.view !== "portfolio";
    $("resultCount").textContent = state.query ? `${list.length} of ${tools.length} tools match` : `${tools.length} tools`;
    const target = $("panel-" + state.view);
    if (!list.length) { target.replaceChildren(el("p", "panel empty-inline", "No tools match this filter.")); return; }
    const content = state.view === "pipeline" ? renderBoard(list) : state.view === "owners" ? renderOwners(list) : renderTable(list);
    if (state.view === "portfolio") { const scroll = el("div", "table-scroll"); scroll.append(content); target.replaceChildren(scroll); }
    else target.replaceChildren(content);
  }

  function setView(view, focus) {
    if (!views.includes(view)) return;
    state.view = view;
    try { history.replaceState(null, "", "#" + view); } catch {}
    render();
    if (focus) $("tab-" + view).focus();
  }

  function start() {
    const source = $("sourceLink");
    if (source && /^https?:\/\//.test(data.sourceUrl || "")) source.href = data.sourceUrl;
    if (typeof data.notice === "string" && data.notice.trim()) $("portfolioNotice").textContent = data.notice.trim();
    $("metricStaleNote").textContent = `not updated in ${staleDays}+ days`;
    if (!tools.length) { $("emptyState").hidden = false; $("dashboard").hidden = true; return; }
    $("emptyState").hidden = true;
    $("dashboard").hidden = false;
    renderSummary();
    const group = $("groupBy");
    group.replaceChildren(...P.groupings.map(name => { const option = el("option", "", name); option.value = name; return option; }));
    group.addEventListener("change", () => { state.group = group.value; render(); });
    $("toolFilter").addEventListener("input", event => { state.query = event.target.value; render(); });
    views.forEach((view, index) => {
      const tab = $("tab-" + view);
      tab.addEventListener("click", () => setView(view));
      tab.addEventListener("keydown", event => {
        const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (step) { event.preventDefault(); setView(views[(index + step + views.length) % views.length], true); }
      });
    });
    const fromHash = location.hash.replace("#", "");
    if (views.includes(fromHash)) state.view = fromHash;
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
