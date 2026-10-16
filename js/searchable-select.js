"use strict";
// Adds a type-to-search list to any <select data-searchable>. The select itself is never moved or rewritten: choosing an
// entry sets its value and fires its normal input and change events, so saving and validation work as before.
(() => {
  let panel = null, owner = null, items = [], active = -1;
  const search = document.createElement("input"), list = document.createElement("ul"), empty = document.createElement("p");
  search.type = "search"; search.className = "ss-search"; search.autocomplete = "off"; search.setAttribute("role", "combobox"); search.setAttribute("aria-expanded", "true"); search.setAttribute("aria-controls", "ssList");
  list.className = "ss-list"; list.id = "ssList"; list.setAttribute("role", "listbox");
  empty.className = "ss-empty"; empty.textContent = "No matches."; empty.hidden = true;
  const unavailable = select => select.disabled || !!select.closest("fieldset:disabled");
  function highlight(index) {
    items.forEach((item, i) => { item.el.classList.toggle("is-active", i === index); item.el.setAttribute("aria-selected", String(i === index)); });
    active = index;
    const el = items[index]?.el;
    if (!el) return search.removeAttribute("aria-activedescendant");
    search.setAttribute("aria-activedescendant", el.id);
    // Scroll only the list: scrollIntoView would also move the page behind it.
    if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight;
  }
  function filter() {
    const term = search.value.trim().toLowerCase();
    let first = -1;
    items.forEach((item, i) => {
      const show = !term || (item.value !== "" && (item.text.toLowerCase().includes(term) || item.value.toLowerCase() === term));
      item.el.hidden = !show;
      if (show && first < 0) first = i;
    });
    empty.hidden = first >= 0;
    highlight(first);
  }
  function place() {
    const rect = owner.getBoundingClientRect(), below = window.innerHeight - rect.bottom, room = Math.max(below, rect.top);
    panel.style.width = rect.width + "px"; panel.style.left = rect.left + "px";
    list.style.maxHeight = Math.max(120, Math.min(280, room - 70)) + "px";
    if (below >= 220 || below >= rect.top) { panel.style.top = rect.bottom + 4 + "px"; panel.style.bottom = "auto"; }
    else { panel.style.bottom = window.innerHeight - rect.top + 4 + "px"; panel.style.top = "auto"; }
  }
  function close(refocus = true) {
    if (!panel || panel.hidden) return;
    panel.hidden = true; owner.setAttribute("aria-expanded", "false");
    const select = owner; owner = null;
    if (refocus) select.focus({ preventScroll: true });
  }
  function choose(index) {
    const item = items[index];
    if (!item || !owner) return;
    const select = owner, changed = select.value !== item.value;
    close();
    if (!changed) return;
    select.value = item.value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function ensure() {
    if (panel) return;
    panel = document.createElement("div"); panel.className = "ss-panel"; panel.hidden = true;
    panel.append(search, list, empty); document.body.append(panel);
    search.addEventListener("input", filter);
    search.addEventListener("keydown", event => {
      const visible = items.map((item, i) => i).filter(i => !items[i].el.hidden), at = visible.indexOf(active);
      if (event.key === "ArrowDown") { event.preventDefault(); highlight(visible[Math.min(at + 1, visible.length - 1)] ?? -1); }
      else if (event.key === "ArrowUp") { event.preventDefault(); highlight(visible[Math.max(at - 1, 0)] ?? -1); }
      else if (event.key === "Enter") { event.preventDefault(); if (active >= 0) choose(active); }
      else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
      else if (event.key === "Tab") close(false);
    });
    list.addEventListener("mousedown", event => event.preventDefault());
    list.addEventListener("click", event => { const el = event.target.closest("li"); if (el) choose(items.findIndex(item => item.el === el)); });
    list.addEventListener("mousemove", event => { const el = event.target.closest("li"); const i = items.findIndex(item => item.el === el); if (i >= 0 && i !== active) highlight(i); });
    document.addEventListener("mousedown", event => { if (panel && !panel.hidden && !panel.contains(event.target) && event.target !== owner) close(false); });
    // The page may scroll or resize while the list is open: follow the select, and close only once it is out of view.
    const follow = event => {
      if (!panel || panel.hidden || panel.contains(event.target)) return;
      const rect = owner.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) close(false); else place();
    };
    window.addEventListener("resize", follow);
    window.addEventListener("scroll", follow, true);
  }
  function open(select) {
    if (unavailable(select)) return;
    ensure();
    if (owner && owner !== select) close(false);
    owner = select; select.setAttribute("aria-expanded", "true");
    list.replaceChildren();
    items = Array.from(select.options).map((option, i) => {
      const el = document.createElement("li");
      el.id = "ssOption" + i; el.setAttribute("role", "option"); el.textContent = option.textContent;
      if (option.value === "") el.classList.add("is-placeholder");
      if (option.selected) el.classList.add("is-selected");
      list.append(el);
      return { el, value: option.value, text: option.textContent };
    });
    search.value = ""; search.setAttribute("aria-label", "Search " + (select.closest("label")?.firstChild?.textContent.trim() || "options"));
    panel.hidden = false; place(); filter();
    const selected = items.findIndex(item => item.el.classList.contains("is-selected") && item.value !== "");
    if (selected >= 0) highlight(selected);
    search.focus({ preventScroll: true });
  }
  function enhance(select) {
    if (select.dataset.searchableReady) return;
    select.dataset.searchableReady = "true"; select.setAttribute("aria-haspopup", "listbox"); select.setAttribute("aria-expanded", "false");
    select.addEventListener("mousedown", event => { if (event.button !== 0 || unavailable(select)) return; event.preventDefault(); select.focus({ preventScroll: true }); panel && !panel.hidden && owner === select ? close() : open(select); });
    select.addEventListener("keydown", event => {
      if (unavailable(select)) return;
      if (event.key === "Enter" || event.key === " " || event.key === "F4" || (event.altKey && (event.key === "ArrowDown" || event.key === "ArrowUp"))) { event.preventDefault(); open(select); }
    });
  }
  const init = () => document.querySelectorAll("select[data-searchable]").forEach(enhance);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
  window.SearchableSelect = { enhance, init };
})();
