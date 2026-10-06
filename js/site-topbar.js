"use strict";
// Shared top bar for Case Notes, the escalation page and Support Trends. Every page renders it from this file, so the
// menus always match. Place <header class="topbar" id="siteTopbar" data-page="…"></header> followed
// by this script (not deferred), so the controls exist before the page's own scripts run.
window.SiteTopbar = (() => {
  const pages = {
    "case-notes": {
      name: "Case Notes",
      training: [["tutorialDemo", "Tutorial Demo"], ["loadExampleNote", "Load Example", true]],
      // Case Notes owns the site settings dialogs; other pages link to them.
      settingsHere: true
    },
    "escalation": {
      name: "DE Escalation Request",
      training: [["tutorialDemo", "Tutorial Demo"], ["loadWeak", "Load Weak Example"], ["loadStrong", "Load Strong Example"]],
      settingsHere: false
    },
    "trends": { name: "Support Trends", training: [], settingsHere: false }
  };
  const tools = [
    ["tools.html", "Tools Hub"],
    ["https://seancrawforddell.github.io/DellSupportoolRepository/#/tools", "ISG Tools Catalog ↗", "", true],
    ["https://github.com/DellProSupportGse/Tools", "Microsoft Support Tools ↗", "", true]
  ];
  const menus = { tools: "openToolsMenu", training: "openTraining", settings: "openSettingsMenu" };
  const settings = [["customizeFields", "Customize Site Options", "customize-fields"], ["openBackupRestore", "Backup &amp; Restore", "backup-restore"]];
  const icons = {
    moon: '<svg class="theme-moon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10Z"/></svg>',
    sun: '<svg class="theme-sun" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>',
    gear: '<svg width="27.5" height="27.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 3 1-1h4l1 1 .5 2 2 .8 1.8-.6 2 3.5-.4 1.3-1.5 1.3v2.4l1.5 1.3.4 1.3-2 3.5-1.8-.6-2 .8-.5 2-1 1h-4l-1-1-.5-2-2-.8-1.8.6-2-3.5.4-1.3 1.5-1.3v-2.4l-1.5-1.3-.4-1.3 2-3.5 1.8.6 2-.8Z"/><circle cx="12" cy="12" r="3"/></svg>'
  };
  function feedbackUrl(name) {
    const body = `**Type:** Feature request / Bug (delete one)\n**Page:** ${name}\n\n**What would you like, or what went wrong?**\n\n\n**Steps to reproduce (bugs only):**\n1.\n\n**Expected result:**\n\n\n_Do not include customer names, Service Tags, SR numbers, logs, or other case data._`;
    return "https://github.com/SeanCrawfordDell/EscalationQuality/issues/new?title=" + encodeURIComponent(`[${name}] `) + "&body=" + encodeURIComponent(body);
  }
  function markup(page) {
    const config = pages[page];
    if (!config) throw Error("Unknown top bar page: " + page);
    const menu = (name, label, items) => `<div class="topbar-menu" id="${name}Menu"><button class="button secondary" id="${menus[name]}" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="${name}MenuList">${label} <span aria-hidden="true">▾</span></button><div class="topbar-dropdown ${name}-dropdown" id="${name}MenuList" hidden>${items}</div></div>`;
    const toolItems = tools.map(([href, label, id, external]) => `<a class="dropdown-item"${id ? ` id="${id}"` : ""} href="${href}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${label}</a>`).join("");
    const trainingItems = config.training.map(([id, label, disabled]) => `<button class="dropdown-item" id="${id}" type="button"${disabled ? " disabled" : ""}>${label}</button>`).join("");
    const settingItems = settings.map(([id, label, hash]) => config.settingsHere
      ? `<button class="dropdown-item" id="${id}" type="button"${id === "customizeFields" ? " disabled" : ' aria-haspopup="dialog"'}>${label}</button>`
      : `<a class="dropdown-item" id="${id}" href="case-notes.html#${hash}" title="Opens in Case Notes, where site settings are kept.">${label}</a>`).join("");
    return `<a class="brand home-link" href="index.html" aria-label="Back to Technical Support Assistant"><span class="brand-mark">←</span><span>Support Assistant</span></a>` +
      `<nav class="topbar-actions" aria-label="${config.name} actions">${menu("tools", "Tools", toolItems)}${config.training.length ? menu("training", "Tutorial &amp; examples", trainingItems) : ""}</nav>` +
      `<div class="appearance-actions" role="group" aria-label="Feedback, appearance, and settings">` +
      `<a class="button secondary" id="requestFeature" href="${feedbackUrl(config.name).replace(/&/g, "&amp;")}" target="_blank" rel="noopener noreferrer" title="Opens a new GitHub issue in a new tab. Do not include customer or case data.">Request feature / Report bug ↗</a>` +
      `<div class="theme-controls"><button class="theme-icon-toggle" id="themeToggle" type="button" aria-label="Switch to dark mode">${icons.moon}${icons.sun}</button></div>` +
      `<div class="topbar-menu" id="settingsMenu"><button class="button secondary settings-toggle" id="openSettingsMenu" type="button" aria-label="Settings" title="Settings" aria-haspopup="true" aria-expanded="false" aria-controls="settingsMenuList">${icons.gear}</button><div class="topbar-dropdown settings-dropdown" id="settingsMenuList" hidden>${settingItems}</div></div>` +
      `</div>`;
  }

  // Dropdowns close after a choice, an outside click, or Escape. Only one is open at a time.
  const $ = id => document.getElementById(id);
  // The tutorial opens dropdowns to show their items; its Next clicks must not close them again.
  const tourRunning = () => !!document.body?.classList?.contains?.("tour-running");
  function setMenu(name, open, focusFirst = false) {
    const list = $(name + "MenuList"), toggle = $(menus[name]);
    if (!list || !toggle) return;
    list.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      for (const other of Object.keys(menus)) if (other !== name) setMenu(other, false);
      if (focusFirst) [...list.querySelectorAll("button, a")].find(item => !item.disabled)?.focus();
    }
  }
  const closeMenus = () => Object.keys(menus).forEach(name => setMenu(name, false));
  function wire() {
    for (const [name, toggleId] of Object.entries(menus)) {
      const toggle = $(toggleId), list = $(name + "MenuList");
      toggle?.addEventListener("click", () => setMenu(name, list.hidden));
      toggle?.addEventListener("keydown", event => { if (event.key === "ArrowDown") { event.preventDefault(); setMenu(name, true, true); } });
      list?.addEventListener("click", event => { if (event.target?.closest?.("button, a")) setMenu(name, false); });
    }
    document.addEventListener("click", event => {
      if (tourRunning() || !event.target) return;
      for (const name of Object.keys(menus)) if (!$(name + "MenuList")?.hidden && !$(name + "Menu")?.contains(event.target)) setMenu(name, false);
    });
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      const open = Object.keys(menus).find(name => !$(name + "MenuList")?.hidden);
      if (open) { setMenu(open, false); $(menus[open])?.focus(); }
    });
  }
  function render(header = document.getElementById("siteTopbar")) {
    if (!header) return;
    header.innerHTML = markup(header.dataset.page);
    wire();
  }
  render();
  return { pages, markup, render, setMenu, closeMenus };
})();
