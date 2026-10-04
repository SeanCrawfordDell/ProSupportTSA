"use strict";
// Shared by every tool and loaded first. GitHub Pages cannot send frame-ancestors or X-Frame-Options,
// so refuse to render inside another site's frame (clickjacking) and take over the top window instead.
if (window.top !== window.self) {
  document.documentElement.style.display = "none";
  try { window.top.location = window.self.location.href; } catch { /* The page stays hidden. */ }
}
// No saved preference means follow the operating system.
(() => {
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  const valid = value => value === "dark" || value === "light" ? value : null;
  let preference = null;
  try { preference = valid(localStorage.getItem("theme")); } catch { /* Storage may be unavailable. */ }
  function apply() {
    const dark = (preference || (system.matches ? "dark" : "light")) === "dark";
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    const toggle = document.getElementById("themeToggle");
    if (toggle) {
      toggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      toggle.title = dark ? "Switch to light mode" : "Switch to dark mode";
    }
    const label = document.getElementById("themeLabel");
    if (label) label.textContent = dark ? "Light" : "Dark";
  }
  function save(value) {
    preference = value;
    try {
      if (value === null) localStorage.removeItem("theme");
      else localStorage.setItem("theme", value);
    } catch { /* Keep the selection for this page when storage is blocked. */ }
    apply();
  }
  // Files added below carry the same cache version as this script, so one tag per page stays true.
  const version = (() => { try { return new URL(document.currentScript.src).searchParams.get("v"); } catch { return null; } })();
  const versioned = path => version ? path + "?v=" + encodeURIComponent(version) : path;
  apply(); // Run before styles render to avoid a flash of the wrong theme.
  document.addEventListener("DOMContentLoaded", () => {
    apply();
    if (!document.querySelector('script[src^="js/site-navigation.js"]')) {
      const navigation = document.createElement("script");
      navigation.src = versioned("js/site-navigation.js");
      navigation.defer = true;
      document.head.append(navigation);
    }
    if (!document.querySelector('link[href^="css/header-layout.css"]')) {
      const layout = document.createElement("link");
      layout.rel = "stylesheet";
      layout.href = versioned("css/header-layout.css");
      document.head.append(layout);
    }
    document.getElementById("themeToggle")?.addEventListener("click", () => {
      save(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
    });
  });
  system.addEventListener("change", apply);
  window.addEventListener("supportSettingsRestored", () => {
    try { preference = valid(localStorage.getItem("theme")); } catch {}
    apply();
  });
  window.addEventListener("storage", event => {
    if (event.key === "theme" || event.key === null) {
      preference = valid(event.newValue);
      apply();
    }
  });
})();
