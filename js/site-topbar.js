"use strict";
// Shared top bar for Case Notes, the escalation page and Support Trends. Every page renders it from this file, so the
// menus always match. Place <header class="topbar" id="siteTopbar" data-page="…"></header> followed
// by this script (not deferred), so the controls exist before the page's own scripts run.
window.SiteTopbar = (() => {
  const pages = {
    "case-notes": {
      name: "Case Notes",
      training: [["openWiki", "Wiki Documentation ↗", false, true], ["tutorialDemo", "Tutorial Demo"], ["loadExampleNote", "Load Example", true]],
      // Case Notes owns the site settings dialogs; other pages link to them.
      settingsHere: true
    },
    "escalation": {
      name: "DE Escalation Request",
      training: [["openWiki", "Wiki Documentation ↗", false, true], ["tutorialDemo", "Tutorial Demo"], ["loadWeak", "Load Weak Example"], ["loadStrong", "Load Strong Example"]],
      settingsHere: false
    },
    "trends": { name: "Support Trends", training: [["openWiki", "Wiki Documentation ↗", false, true]], settingsHere: false }
  };
  const isgCatalog = "https://pages.eos2git.cec.lab.emc.com/Sean-Crawford/ISGToolsCatalog/";
  const tools = [
    ["tools.html", "Tools Hub"],
    [isgCatalog, "ISG Tools Catalog ↗", "", true]
  ];
  // The site-wide menu, identical to the landing pages: [hub page, label, [[link, label, opens in a new tab]]].
  const siteNav = [
    ["tools.html", "Tools", [["tools.html", "Tools hub"], [isgCatalog, "ISG Tools Catalog", true]]],
    ["case-management.html", "Case Management", [["case-management.html", "Case Management hub"], ["escalation-quality.html", "DE Escalation Request"], ["case-notes.html", "Case Notes"]]],
    ["knowledge.html", "Knowledge", [["knowledge.html", "Knowledge hub"]]],
    ["ai-resources.html", "AI Resources", [["ai-resources.html", "AI resources hub"]]],
    ["training.html", "Training", [["training.html", "Training hub"]]]
  ];
  const menus = { tools: "openToolsMenu", training: "openTraining", settings: "openSettingsMenu" };
  const settings = [["customizeFields", "Customize Site Options", "customize-fields"], ["openBackupRestore", "Backup &amp; Restore", "backup-restore"]];
  const icons = {
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
    const trainingItems = config.training.map(([id, label, disabled, external]) => external
      ? `<a class="dropdown-item" id="${id}" href="wiki.html" target="_blank" rel="noopener noreferrer">${label}</a>`
      : `<button class="dropdown-item" id="${id}" type="button"${disabled ? " disabled" : ""}>${label}</button>`).join("");
    const settingItems = settings.map(([id, label, hash]) => config.settingsHere
      ? `<button class="dropdown-item" id="${id}" type="button"${id === "customizeFields" ? " disabled" : ' aria-haspopup="dialog"'}>${label}</button>`
      : `<a class="dropdown-item" id="${id}" href="case-notes.html#${hash}" title="Opens in Case Notes, where site settings are kept.">${label}</a>`).join("");
    return `<a class="brand home-link" href="index.html" aria-label="Back to Technical Support Assistant"><span class="brand-mark">←</span><span>Support Assistant</span></a>` +
      `<nav class="topbar-actions" aria-label="${config.name} actions">${menu("tools", "Tools", toolItems)}${config.training.length ? menu("training", "Tutorial &amp; examples", trainingItems) : ""}</nav>` +
      `<div class="appearance-actions" role="group" aria-label="Feedback, appearance, and settings">` +
      `<a class="button secondary" id="requestFeature" href="${feedbackUrl(config.name).replace(/&/g, "&amp;")}" target="_blank" rel="noopener noreferrer" title="Opens a new GitHub issue in a new tab. Do not include customer or case data.">Request feature / Report bug ↗</a>` +
      `<div class="topbar-menu" id="settingsMenu"><button class="button secondary settings-toggle" id="openSettingsMenu" type="button" aria-label="Settings" title="Settings" aria-haspopup="true" aria-expanded="false" aria-controls="settingsMenuList">${icons.gear}</button><div class="topbar-dropdown settings-dropdown" id="settingsMenuList" hidden>${settingItems}</div></div>` +
      `</div>`;
  }
  // The landing-page header (brand, resource search, site menu, Light/Dark button) shown above the tool's own bar.
  // site-navigation.js wires #globalSearch and theme.js wires #themeToggle once they exist.
  function headerMarkup() {
    const menu = ([hub, label, links]) => `<div class="menu-item"><a class="menu-trigger" href="${hub}">${label} <span aria-hidden="true">⌄</span></a><div class="submenu">` +
      links.map(([href, text, external]) => `<a href="${href}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${text}</a>`).join("") + `</div></div>`;
    return `<a class="brand" href="index.html" aria-label="Dell Pro-Support home"><span class="dell">DELL</span><span class="brand-divider"></span><span>Pro-Support</span></a>` +
      `<div class="global-search" role="search"><label><span class="visually-hidden">Search resources</span><input id="globalSearch" type="search" placeholder="Search resources" autocomplete="off" aria-controls="globalResults"></label><div class="global-results" id="globalResults" hidden></div><p class="visually-hidden" id="globalStatus" role="status"></p></div>` +
      `<nav class="primary-nav" aria-label="Primary navigation">${siteNav.map(menu).join("")}</nav>` +
      `<div class="theme-controls" role="group" aria-label="Appearance"><button class="theme-switch" id="themeToggle" type="button" aria-label="Switch to dark mode"><span aria-hidden="true">◐</span> <span id="themeLabel">Dark</span></button></div>`;
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
    if (!document.getElementById("siteHeader")) header.insertAdjacentHTML?.("beforebegin", `<header class="site-header" id="siteHeader">${headerMarkup()}</header>`);
    header.innerHTML = markup(header.dataset.page);
    wire();
  }
  render();
  return { pages, markup, headerMarkup, render, setMenu, closeMenus };
})();
