"use strict";
// Tool Portfolio page: summary, development-status bar and three views (Portfolio table, Pipeline board, Who owns what)
// of the ISG Tools Catalog. On open it reads the catalog's own tools.json (PortfolioData.liveUrl), so owners and statuses
// follow the catalog; if that cannot be reached it shows the fallback copy in js/portfolio-data.js and says so.
// Everything is built with DOM methods, so catalog text is never parsed as HTML.
(() => {
  const P = window.PortfolioCore, data = window.PortfolioData || { tools: [] };
  const $ = id => document.getElementById(id);
  const views = ["portfolio", "pipeline", "owners"];
  const state = { view: "portfolio", group: "Development Status", query: "" };
  let tools = [], owners = [];

  const el = (tag, className, textValue) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (textValue !== undefined) node.textContent = textValue;
    return node;
  };
  const statusPill = tool => el("span", "pill status status-" + tool.status, tool.statusLabel);
  const statusDot = id => el("span", "dot status-" + id);
  function avatar(name) {
    const index = owners.indexOf(name);
    const node = el("span", "avatar " + (name === P.unassigned ? "avatar-none" : "avatar-" + (index % 8)), P.initials(name));
    node.setAttribute("aria-hidden", "true");
    return node;
  }
  function owner(name) {
    const wrap = el("span", "owner");
    wrap.append(avatar(name), document.createTextNode(name));
    return wrap;
  }
  function progress(tool) {
    if (tool.percent === null) return el("span", tool.progressLabel ? "progress-text" : "muted", tool.progressLabel || "—");
    const wrap = el("div", "progress"), bar = el("div", "bar"), fill = el("span");
    fill.style.width = tool.percent + "%";
    bar.append(fill);
    bar.setAttribute("role", "img");
    bar.setAttribute("aria-label", tool.percent + "% complete");
    wrap.append(bar, el("span", "progress-label", tool.progressLabel));
    return wrap;
  }
  function toolName(tool) {
    const wrap = el("div", "tool-name");
    const title = tool.link ? el("a", "", tool.name) : el("strong", "", tool.name);
    if (tool.link) { title.href = tool.link; title.target = "_blank"; title.rel = "noopener noreferrer"; }
    wrap.append(title, el("span", "muted small", tool.category));
    return wrap;
  }

  function renderSummary() {
    const s = P.summary(tools);
    $("metricTotal").textContent = s.total;
    $("metricReleased").textContent = s.released;
    $("metricTesting").textContent = s.testing;
    $("metricDevelopment").textContent = s.inDevelopment;
    $("metricOwners").textContent = s.owners;
    $("stageBar").replaceChildren(...s.statuses.filter(x => x.count).map(x => { const seg = el("span", "seg status-" + x.id); seg.style.flexGrow = x.count; seg.title = `${x.label}: ${x.count}`; return seg; }));
    $("stageLegend").replaceChildren(...s.statuses.map(x => { const item = el("li", "legend-item"); item.append(statusDot(x.id), document.createTextNode(`${x.label} `), el("strong", "", String(x.count))); return item; }));
  }

  function renderTable(list) {
    const table = el("table", "portfolio-table"), head = el("thead"), row = el("tr");
    for (const label of ["Tool", "Owner", "Development Status", "Progress", "Operating system", "Description"]) { const th = el("th", "", label); th.scope = "col"; row.append(th); }
    head.append(row);
    table.append(head);
    for (const group of P.groups(list, state.group)) {
      const body = el("tbody"), groupRow = el("tr", "group-row"), th = el("th");
      th.colSpan = 6; th.scope = "rowgroup";
      if (state.group === "Development Status") th.append(statusDot(group.key));
      else if (state.group === "Owner") th.append(avatar(group.name));
      th.append(document.createTextNode(group.name + " "), el("span", "count", String(group.tools.length)));
      groupRow.append(th);
      body.append(groupRow);
      for (const tool of group.tools) {
        const tr = el("tr");
        for (const cell of [toolName(tool), owner(tool.owner), statusPill(tool), progress(tool), el("span", "os", tool.os || "—"), el("span", "note", tool.description || "—")]) {
          const td = el("td"); td.append(cell); tr.append(td);
        }
        body.append(tr);
      }
      table.append(body);
    }
    return table;
  }

  function renderBoard(list) {
    const board = el("div", "board");
    for (const column of P.columns(list)) {
      const section = el("section", "board-column"), title = el("h3");
      title.append(statusDot(column.id), document.createTextNode(column.name + " "), el("span", "count", String(column.tools.length)));
      section.append(title);
      if (!column.tools.length) section.append(el("p", "muted small column-empty", "No tools"));
      for (const tool of column.tools) {
        const card = el("article", "tool-card-mini");
        card.append(toolName(tool), owner(tool.owner));
        if (tool.progressLabel && tool.percent !== 100) card.append(progress(tool));
        section.append(card);
      }
      board.append(section);
    }
    return board;
  }

  function renderOwners(list) {
    const grid = el("div", "owner-grid");
    for (const person of P.owners(list)) {
      const card = el("section", "owner-card"), head = el("div", "owner-head"), who = el("div");
      who.append(el("h3", "", person.name), el("span", "muted small", `${person.tools.length} tool${person.tools.length === 1 ? "" : "s"}`));
      head.append(avatar(person.name), who);
      const counts = el("div", "owner-counts");
      counts.append(...person.byStatus.map(s => el("span", "pill status status-" + s.id, `${s.count} ${s.label}`)));
      const items = el("ul", "owner-tools");
      for (const tool of person.tools) {
        const item = el("li"), name = el("span", "owner-tool-name", tool.name);
        item.append(name, statusPill(tool));
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
      const tab = $("tab-" + view), selected = view === state.view;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      $("panel-" + view).hidden = !selected;
    }
    $("groupControl").hidden = state.view !== "portfolio";
    $("resultCount").textContent = state.query ? `${list.length} of ${tools.length} tools match` : `${tools.length} tools`;
    const target = $("panel-" + state.view);
    if (!list.length) { target.replaceChildren(el("p", "panel empty-inline", "No tools match this filter.")); return; }
    if (state.view === "portfolio") { const scroll = el("div", "table-scroll"); scroll.append(renderTable(list)); target.replaceChildren(scroll); }
    else target.replaceChildren(state.view === "pipeline" ? renderBoard(list) : renderOwners(list));
  }

  function setView(view, focus) {
    if (!views.includes(view)) return;
    state.view = view;
    try { history.replaceState(null, "", "#" + view); } catch {}
    render();
    if (focus) $("tab-" + view).focus();
  }

  // Reads the catalog's live tools.json; null when it cannot be reached or is not a catalog.
  async function fetchLive() {
    if (!data.liveUrl || !/^https?:$/.test(location.protocol)) return null;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(new URL(data.liveUrl, location.href), { cache: "no-store", signal: controller.signal });
      if (!response.ok) return null;
      return P.parseCatalog(await response.json());
    } catch { return null; } finally { clearTimeout(timer); }
  }

  function wire() {
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
  }

  async function start() {
    const catalogUrl = /^https?:\/\//.test(data.sourceUrl || "") ? data.sourceUrl : "";
    if (catalogUrl) $("sourceLink").href = catalogUrl;
    wire();
    const live = await fetchLive();
    const notice = $("portfolioNotice");
    if (live) {
      tools = live.map((tool, i) => P.normalize(tool, i, catalogUrl));
      notice.textContent = `Live from the ISG Tools Catalog, read when this page opened. Owner and Development Status changes in the catalog appear here on the next visit.`;
    } else {
      tools = P.load(data, catalogUrl);
      notice.textContent = `The live ISG Tools Catalog could not be reached, so this shows the copy saved${data.snapshotDate ? " on " + data.snapshotDate : ""}. Owners or statuses changed since then are not shown.`;
      notice.classList.add("notice-warning");
    }
    owners = P.owners(tools).map(o => o.name);
    $("loadingState").hidden = true;
    if (!tools.length) { $("emptyState").hidden = false; return; }
    $("dashboard").hidden = false;
    renderSummary();
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
