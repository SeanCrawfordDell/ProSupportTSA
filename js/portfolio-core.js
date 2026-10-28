"use strict";
// Tool Portfolio: pure functions behind portfolio.html, shared with tests/portfolio.test.cjs.
// Each tool in js/portfolio-data.js is one row. Stage, Health, Owner and the status note are set by the tool's owner;
// task counts come from the tool's tracking issue (sub-issues done / total).
const PortfolioCore = (() => {
  const stages = ["Intake", "Design", "Build", "Test", "Release", "Support"];
  const healths = ["Off track", "At risk", "On track"];
  const groupings = ["Health", "Stage", "Owner"];
  const unassigned = "Unassigned";
  const day = 24 * 60 * 60 * 1000;

  const text = value => String(value ?? "").trim();
  const count = value => { const n = Math.floor(Number(value)); return Number.isFinite(n) && n > 0 ? n : 0; };
  const pick = (value, list, fallback) => list.find(item => item.toLowerCase() === text(value).toLowerCase()) || fallback;

  // Cleans one record from the data file. Unknown stages and health values fall back instead of failing the page.
  function normalize(tool, index = 0) {
    const total = count(tool?.tasksTotal), done = Math.min(count(tool?.tasksDone), total);
    const updated = text(tool?.updated);
    return {
      id: text(tool?.id) || "tool-" + (index + 1),
      name: text(tool?.name) || "Untitled tool",
      category: text(tool?.category),
      description: text(tool?.description),
      link: /^https?:\/\//i.test(text(tool?.link)) ? text(tool.link) : "",
      owner: text(tool?.owner) || unassigned,
      stage: pick(tool?.stage, stages, "Intake"),
      health: pick(tool?.health, healths, "On track"),
      tasksDone: done,
      tasksTotal: total,
      target: text(tool?.target),
      note: text(tool?.note),
      updated: Number.isNaN(Date.parse(updated)) ? "" : updated
    };
  }

  const percent = tool => tool.tasksTotal ? Math.round(tool.tasksDone / tool.tasksTotal * 100) : 0;
  // Days since the owner last updated the row; null when never recorded.
  const age = (tool, now = Date.now()) => tool.updated ? Math.max(0, Math.floor((now - Date.parse(tool.updated)) / day)) : null;
  const stale = (tool, staleDays, now) => { const days = age(tool, now); return days === null || days > staleDays; };
  function updatedLabel(tool, now) {
    const days = age(tool, now);
    return days === null ? "Never" : days === 0 ? "Today" : days === 1 ? "Yesterday" : days + "d ago";
  }

  // Problems first, then earliest stage, then name.
  const order = (a, b) => healths.indexOf(a.health) - healths.indexOf(b.health) || stages.indexOf(a.stage) - stages.indexOf(b.stage) || a.name.localeCompare(b.name);

  function matches(tool, query) {
    const term = text(query).toLowerCase();
    if (!term) return true;
    return [tool.name, tool.category, tool.description, tool.owner, tool.stage, tool.health, tool.note].join(" ").toLowerCase().includes(term);
  }

  function summary(tools, staleDays = 7, now = Date.now()) {
    const byHealth = Object.fromEntries(healths.map(h => [h, tools.filter(t => t.health === h).length]));
    return {
      total: tools.length,
      onTrack: byHealth["On track"], atRisk: byHealth["At risk"], offTrack: byHealth["Off track"],
      stale: tools.filter(t => stale(t, staleDays, now)).length,
      stages: stages.map(name => ({ name, count: tools.filter(t => t.stage === name).length }))
    };
  }

  // Rows for the Portfolio table, grouped by Health, Stage or Owner. Empty groups are left out.
  function groups(tools, by = "Health") {
    const key = by === "Stage" ? "stage" : by === "Owner" ? "owner" : "health";
    const names = by === "Stage" ? stages : by === "Owner" ? owners(tools).map(o => o.name) : healths;
    return names.map(name => ({ name, tools: tools.filter(t => t[key] === name).sort(order) })).filter(g => g.tools.length);
  }

  // Pipeline board: one column per stage, including empty ones, problems at the top.
  const columns = tools => stages.map(name => {
    const cards = tools.filter(t => t.stage === name).sort(order);
    return { name, tools: cards, attention: cards.filter(t => t.health !== "On track").length };
  });

  // Who owns what: owners with the most Off track (counted twice) and At risk tools first; Unassigned always first.
  function owners(tools) {
    const names = [...new Set(tools.map(t => t.owner))];
    return names.map(name => {
      const mine = tools.filter(t => t.owner === name).sort(order);
      const off = mine.filter(t => t.health === "Off track").length, risk = mine.filter(t => t.health === "At risk").length;
      return { name, tools: mine, off, risk, on: mine.length - off - risk, openTasks: mine.reduce((n, t) => n + t.tasksTotal - t.tasksDone, 0) };
    }).sort((a, b) => (b.name === unassigned) - (a.name === unassigned) || (b.off * 2 + b.risk) - (a.off * 2 + a.risk) || a.name.localeCompare(b.name));
  }

  const initials = name => name === unassigned ? "?" : text(name).split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");

  return { stages, healths, groupings, unassigned, normalize, percent, age, stale, updatedLabel, order, matches, summary, groups, columns, owners, initials };
})();
if (typeof window !== "undefined") window.PortfolioCore = PortfolioCore;
if (typeof module !== "undefined") module.exports = PortfolioCore;
