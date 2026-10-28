"use strict";
// Shared site header for Case Notes, the escalation page and Support Trends: the landing-page brand, resource search, site
// menu and Light/Dark button, plus this tool's own Tutorial, feedback and Settings menus. Every page renders it from this
// file, so the menus always match. Place <header class="site-header" id="siteTopbar" data-page="…"></header> followed
// by this script (not deferred), so the controls exist before the page's own scripts run.
// site-navigation.js wires #globalSearch and theme.js wires #themeToggle once they exist.
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
    "trends": { name: "Support Trends", training: [["openWiki", "Wiki Documentation ↗", false, true]], settingsHere: false },
    "portfolio": { name: "Tool Portfolio", training: [["openWiki", "Wiki Documentation ↗", false, true]], settingsHere: false }
  };
  const isgCatalog = "https://pages.eos2git.cec.lab.emc.com/Sean-Crawford/ISGToolsCatalog/";
  // The site-wide menu, identical to the landing pages: [hub page, label, [[link, label, opens in a new tab]]].
  const siteNav = [
    ["tools.html", "Tools", [["tools.html", "Tools hub"], ["portfolio.html", "Tool Portfolio"], [isgCatalog, "ISG Tools Catalog", true]]],
    ["case-management.html", "Case Management", [["case-management.html", "Case Management hub"], ["escalation-quality.html", "DE Escalation Request"], ["case-notes.html", "Case Notes"]]],
    ["knowledge.html", "Knowledge", [["knowledge.html", "Knowledge hub"]]],
    ["ai-resources.html", "AI Resources", [["ai-resources.html", "AI resources hub"]]],
    ["training.html", "Training", [["training.html", "Training hub"]]]
  ];
  // The click-to-open menus that belong to the tool itself. The site menu opens on hover and focus, in CSS.
  const menus = { settings: "openSettingsMenu" };
  const settings = [["customizeFields", "Customize Site Options", "customize-fields"], ["openBackupRestore", "Backup &amp; Restore", "backup-restore"]];
  const icons = {
    gear: '<svg width="27.5" height="27.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 3 1-1h4l1 1 .5 2 2 .8 1.8-.6 2 3.5-.4 1.3-1.5 1.3v2.4l1.5 1.3.4 1.3-2 3.5-1.8-.6-2 .8-.5 2-1 1h-4l-1-1-.5-2-2-.8-1.8.6-2-3.5.4-1.3 1.5-1.3v-2.4l-1.5-1.3-.4-1.3 2-3.5 1.8.6 2-.8Z"/><circle cx="12" cy="12" r="3"/></svg>'
  };
  function feedbackUrl(name) {
    const body = `**Type:** Feature request / Bug (delete one)\n**Page:** ${name}\n\n**What would you like, or what went wrong?**\n\n\n**Steps to reproduce (bugs only):**\n1.\n\n**Expected result:**\n\n\n_Do not include customer names, Service Tags, SR numbers, logs, or other case data._`;
    return "https://eos2git.cec.lab.emc.com/Sean-Crawford/ProSupportTSA/issues/new?title=" + encodeURIComponent(`[${name}] `) + "&body=" + encodeURIComponent(body);
  }
  function markup(page) {
    const config = pages[page];
    if (!config) throw Error("Unknown top bar page: " + page);
    const menu = (name, label, items) => `<div class="menu-item" id="${name}Menu"><a class="menu-trigger" href="#" aria-haspopup="true" aria-expanded="false" aria-controls="${name}MenuList">${label} <span aria-hidden="true">⌄</span></a><div class="submenu ${name}-dropdown" id="${name}MenuList" aria-hidden="true">${items}</div></div>`;
    const siteMenu = ([hub, label, links], index) => `<div class="menu-item"${index === 0 ? ' id="toolsMenu"' : ""}><a class="menu-trigger" href="${hub}">${label} <span aria-hidden="true">⌄</span></a><div class="submenu">` +
      links.map(([href, text, external]) => `<a href="${href}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${text}</a>`).join("") + `</div></div>`;
    const trainingItems = config.training.map(([id, label, disabled, external]) => external
      ? `<a class="dropdown-item" id="${id}" href="wiki.html" target="_blank" rel="noopener noreferrer">${label}</a>`
      : `<a class="dropdown-item" id="${id}" href="#"${disabled ? " class=\"disabled\"" : ""}>${label}</a>`).join("");
    const settingItems = settings.map(([id, label, hash]) => config.settingsHere
      ? `<button class="dropdown-item" id="${id}" type="button"${id === "customizeFields" ? " disabled" : ' aria-haspopup="dialog"'}>${label}</button>`
      : `<a class="dropdown-item" id="${id}" href="case-notes.html#${hash}" title="Opens in Case Notes, where site settings are kept.">${label}</a>`).join("");
    return `<a class="brand" href="index.html" aria-label="Dell Pro-Support home"><span class="dell">DELL</span><span class="brand-divider"></span><span>Pro-Support</span></a>` +
      `<div class="global-search" role="search"><label><span class="visually-hidden">Search resources</span><input id="globalSearch" type="search" placeholder="Search resources" autocomplete="off" aria-controls="globalResults"></label><div class="global-results" id="globalResults" hidden></div><p class="visually-hidden" id="globalStatus" role="status"></p></div>` +
      `<nav class="primary-nav" aria-label="Primary navigation">${siteNav.map(siteMenu).join("")}</nav>` +
      `<div class="page-actions" role="group" aria-label="${config.name} menus">` +
      `${config.training.length ? menu("training", "Tutorial &amp; examples", trainingItems) : ""}` +
      `<a class="button secondary" id="requestFeature" href="${feedbackUrl(config.name).replace(/&/g, "&amp;")}" target="_blank" rel="noopener noreferrer" title="Request feature / Report bug. Opens a new EOS Git issue in a new tab. Do not include customer or case data."><span class="rf-long">Request feature / Report bug</span><span class="rf-short">Feedback</span> ↗</a>` +
      `<div class="topbar-menu" id="settingsMenu"><button class="button secondary settings-toggle" id="openSettingsMenu" type="button" aria-label="Settings" title="Settings" aria-haspopup="true" aria-expanded="false" aria-controls="settingsMenuList">${icons.gear}</button><div class="topbar-dropdown settings-dropdown" id="settingsMenuList" hidden>${settingItems}</div></div>` +
      `</div>` +
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
    // Settings menu uses click behavior; tutorial menu uses hover/focus
    for (const [name, toggleId] of Object.entries(menus)) {
      const toggle = $(toggleId), list = $(name + "MenuList");
      toggle?.addEventListener("click", () => setMenu(name, list.hidden));
      toggle?.addEventListener("keydown", event => { if (event.key === "ArrowDown") { event.preventDefault(); setMenu(name, true, true); } });
      list?.addEventListener("click", event => { if (event.target?.closest?.("button, a")) setMenu(name, false); });
    }
    // Tutorial menu hover behavior - use class-based approach
    const trainingMenu = $("trainingMenu");
    const trainingList = $("trainingMenuList");
    if (trainingMenu && trainingList) {
      const showTraining = () => {
        trainingMenu.classList.add("force-hover");
        trainingList.setAttribute("aria-hidden", "false");
      };
      const hideTraining = () => {
        trainingMenu.classList.remove("force-hover");
        trainingList.setAttribute("aria-hidden", "true");
      };
      trainingMenu.addEventListener("mouseenter", showTraining);
      trainingMenu.addEventListener("mouseleave", hideTraining);
      // Also show on focus, hide on blur
      trainingMenu.addEventListener("focusin", showTraining);
      trainingMenu.addEventListener("focusout", (e) => {
        if (!trainingMenu.contains(e.relatedTarget)) hideTraining();
      });
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
    // Tutorial menu items are links; prevent default to avoid page jump
    document.querySelectorAll("#trainingMenuList a.dropdown-item:not([href=\"wiki.html\"])").forEach(link => {
      link.addEventListener("click", event => { event.preventDefault(); link.id && window[link.id]?.(); });
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
