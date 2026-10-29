"use strict";
// Tool Portfolio: pure functions behind portfolio.html, shared with tests/portfolio.test.cjs.
// Input is the ISG Tools Catalog's own tool records (its tools.json), so the page shows exactly what the catalog says:
// owner, status (shown as Development Status), progress, category, operating systems and description.
const PortfolioCore = (() => {
  // Catalog statuses in pipeline order, with the labels the catalog itself shows.
  const statuses = [
    { id: "idea", label: "Idea" },
    { id: "planning", label: "Planning" },
    { id: "development", label: "Development" },
    { id: "testing", label: "Testing" },
    { id: "internal-testing", label: "Internal Testing" },
    { id: "released", label: "Released" },
    { id: "maintenance", label: "Maintenance" }
  ];
  const other = { id: "other", label: "Other" };
  const groupings = ["Development Status", "Owner", "Category"];
  const unassigned = "Unassigned";
  const uncategorized = "Uncategorized";
  const inDevelopment = ["idea", "planning", "development"], inTesting = ["testing", "internal-testing"], live = ["released", "maintenance"];

  const text = value => String(value ?? "").trim();
  const statusOf = id => statuses.find(s => s.id === id) || other;
  const statusIndex = id => { const i = statuses.findIndex(s => s.id === id); return i < 0 ? statuses.length : i; };

  // "first.last@dell.com" reads as "First Last"; other owners stay as written.
  function ownerName(owner) {
    const value = text(owner);
    const email = /^([^@\s]+)@[^@\s]+$/.exec(value);
    if (!email) return value || unassigned;
    return email[1].split(/[._-]+/).filter(Boolean).map(p => p[0].toUpperCase() + p.slice(1).toLowerCase()).join(" ");
  }
  // A catalog owner field can name several people ("a@dell.com, b@dell.com"); each becomes its own owner.
  function ownerNames(owner) {
    const names = [...new Set(text(owner).split(/\s*[,;\/]\s*|\s+and\s+|\s*&\s*/i).map(text).filter(Boolean).map(ownerName))];
    return names.length ? names : [unassigned];
  }

  // Accepts the catalog file ({ tools: [...] }) or a bare list; anything else is not a catalog.
  function parseCatalog(json) {
    const list = Array.isArray(json) ? json : json && Array.isArray(json.tools) ? json.tools : null;
    if (!list) throw new Error("Not an ISG Tools Catalog file");
    return list.filter(tool => tool && typeof tool === "object");
  }

  // One catalog record → one portfolio row. Missing or unknown values fall back instead of failing the page.
  function normalize(tool, index = 0, catalogUrl = "") {
    const id = text(tool?.id) || "tool-" + (index + 1);
    const statusId = text(tool?.status).toLowerCase();
    const status = statusOf(statusId);
    const progressValue = tool?.progress;
    const percent = Number.isFinite(progressValue) ? Math.max(0, Math.min(100, Math.round(progressValue))) : null;
    const people = ownerNames(tool?.owner);
    const base = /^https?:\/\//i.test(text(catalogUrl)) ? text(catalogUrl).replace(/#.*$/, "") : "";
    return {
      id,
      name: text(tool?.name) || "Untitled tool",
      category: text(tool?.category) || uncategorized,
      description: text(tool?.description),
      owners: people,
      owner: people.join(", "),
      status: status.id,
      statusLabel: status === other && statusId ? statusId.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : status.label,
      percent,
      progressLabel: percent === null ? text(progressValue) : percent + "%",
      os: (Array.isArray(tool?.operatingSystem) ? tool.operatingSystem : [tool?.operatingSystem]).map(text).filter(Boolean).join(", "),
      link: base ? base + "#/tools/" + encodeURIComponent(id) : ""
    };
  }

  const load = (json, catalogUrl) => parseCatalog(json).map((tool, i) => normalize(tool, i, catalogUrl));
  const order = (a, b) => statusIndex(a.status) - statusIndex(b.status) || a.name.localeCompare(b.name);

  function matches(tool, query) {
    const term = text(query).toLowerCase();
    if (!term) return true;
    return [tool.name, tool.category, tool.description, tool.owner, tool.statusLabel, tool.os, tool.progressLabel].join(" ").toLowerCase().includes(term);
  }

  // Statuses that have tools, plus every catalog status for the pipeline and stage bar.
  const usedStatuses = tools => [...statuses, other].filter(s => s !== other || tools.some(t => t.status === "other"));

  function summary(tools) {
    const count = ids => tools.filter(t => ids.includes(t.status)).length;
    return {
      total: tools.length,
      released: count(live),
      testing: count(inTesting),
      inDevelopment: count(inDevelopment),
      owners: new Set(tools.flatMap(t => t.owners).filter(o => o !== unassigned)).size,
      statuses: usedStatuses(tools).map(s => ({ id: s.id, label: s.label, count: tools.filter(t => t.status === s.id).length }))
    };
  }

  // Rows for the Portfolio table, grouped by Development Status, Owner or Category. Empty groups are left out.
  function groups(tools, by = "Development Status") {
    if (by === "Owner") return owners(tools).map(o => ({ key: o.name, name: o.name, tools: o.tools }));
    if (by === "Category") {
      const names = [...new Set(tools.map(t => t.category))].sort((a, b) => (a === uncategorized) - (b === uncategorized) || a.localeCompare(b));
      return names.map(name => ({ key: name, name, tools: tools.filter(t => t.category === name).sort(order) }));
    }
    return usedStatuses(tools).map(s => ({ key: s.id, name: s.label, tools: tools.filter(t => t.status === s.id).sort(order) })).filter(g => g.tools.length);
  }

  // Pipeline board: one column per catalog status, including empty ones.
  const columns = tools => usedStatuses(tools).map(s => ({ id: s.id, name: s.label, tools: tools.filter(t => t.status === s.id).sort(order) }));

  // Who owns what: Unassigned first, then owners with the most tools. A tool with two owners is listed under both.
  function owners(tools) {
    return [...new Set(tools.flatMap(t => t.owners))].map(name => {
      const mine = tools.filter(t => t.owners.includes(name)).sort(order);
      const byStatus = usedStatuses(mine).map(s => ({ id: s.id, label: s.label, count: mine.filter(t => t.status === s.id).length })).filter(s => s.count);
      return { name, tools: mine, byStatus };
    }).sort((a, b) => (b.name === unassigned) - (a.name === unassigned) || b.tools.length - a.tools.length || a.name.localeCompare(b.name));
  }

  const initials = name => name === unassigned ? "?" : text(name).split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");

  return { statuses, groupings, unassigned, ownerName, ownerNames, parseCatalog, normalize, load, order, matches, summary, groups, columns, owners, initials };
})();
if (typeof window !== "undefined") window.PortfolioCore = PortfolioCore;
if (typeof module !== "undefined") module.exports = PortfolioCore;
