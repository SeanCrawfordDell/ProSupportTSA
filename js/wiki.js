"use strict";
// ProSupportTSA Wiki. Every article.doc-page is one wiki page; this script adds navigation, search, the outline,
// the screenshot viewer and copy buttons. Without JavaScript all pages simply read top to bottom.
(() => {
  const $ = id => document.getElementById(id);
  const el = (tag, props = {}, ...kids) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...kids.filter(kid => kid !== null && kid !== undefined));
    return node;
  };
  const pages = [...document.querySelectorAll("article.doc-page")];
  const slug = text => text.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const SITE = "ProSupportTSA Wiki";
  let current = null;

  // Text of an element with a space between every text node, so adjacent cells and list items never run together.
  const wordsOf = node => {
    const parts = [], walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) parts.push(walker.currentNode.nodeValue);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  };

  // ---- Prepare pages: ids, anchors, breadcrumb, reading time, search index ----
  const index = [];
  const usedIds = new Set(pages.map(page => page.id));
  pages.forEach(page => {
    const group = page.dataset.group || "";
    const heading = page.querySelector("h1");
    page.insertBefore(el("p", { className: "breadcrumb" }, el("a", { href: "#" + pages[0].id }, "Wiki"), " › " + group + " › " + page.dataset.title), heading);
    const words = (page.textContent || "").trim().split(/\s+/).length;
    const meta = page.querySelector(".page-meta");
    if (meta) meta.append(` · ${Math.max(1, Math.round(words / 200))} min read`);
    let entry = { id: page.id, title: page.dataset.title, page: page.dataset.title, group, text: "" };
    [...page.children].forEach(child => {
      if (/^H[123]$/.test(child.tagName)) {
        index.push(entry);
        const text = child.textContent.trim();
        if (child.tagName !== "H1") {
          if (!child.id) { let id = page.id + "-" + slug(text), n = 2; while (usedIds.has(id)) id = page.id + "-" + slug(text) + "-" + n++; child.id = id; }
          usedIds.add(child.id);
          child.append(el("a", { className: "anchor", href: "#" + child.id, ariaLabel: "Link to " + text, textContent: "#" }));
        }
        entry = { id: child.tagName === "H1" ? page.id : child.id, title: text, page: page.dataset.title, group, text: "" };
      } else if (!child.matches(".breadcrumb, .pager")) entry.text += " " + wordsOf(child);
    });
    index.push(entry);
  });
  index.forEach(item => { item.text = item.text.trim(); item.haystack = (item.title + " " + item.page + " " + item.text).toLowerCase(); });

  // ---- Pager (previous / next) ----
  pages.forEach((page, i) => {
    const link = (target, cls, label) => target ? el("a", { className: cls, href: "#" + target.id }, el("small", {}, label), target.dataset.title) : el("span", { className: "spacer" });
    page.append(el("div", { className: "pager" }, link(pages[i - 1], "prev", "← Previous"), link(pages[i + 1], "next", "Next →")));
  });

  // ---- Left navigation ----
  const nav = $("wikiNav");
  function renderNav() {
    nav.replaceChildren();
    const order = [...new Set(pages.map(page => page.dataset.group))];
    order.forEach(group => {
      const list = el("ul", { className: "nav-list" });
      pages.filter(page => page.dataset.group === group).forEach(page => {
        const active = page === current;
        const item = el("li", {}, el("a", { className: "nav-link", href: "#" + page.id, textContent: page.dataset.title }));
        if (active) {
          item.firstChild.setAttribute("aria-current", "page");
          const subs = [...page.querySelectorAll(":scope > h2")];
          if (subs.length) item.append(el("ul", { className: "nav-sub" }, ...subs.map(h => el("li", {}, el("a", { className: "nav-link", href: "#" + h.id, textContent: h.firstChild.textContent.trim() })))));
        }
        list.append(item);
      });
      nav.append(el("div", { className: "nav-group" }, el("p", { className: "nav-group-title", textContent: group }), list));
    });
  }

  // ---- "On this page" outline with scroll spy ----
  let headings = [];
  function renderToc() {
    const toc = $("tocList");
    toc.replaceChildren();
    headings = [...current.querySelectorAll(":scope > h2, :scope > h3")];
    headings.forEach(h => toc.append(el("li", { className: h.tagName === "H3" ? "sub" : "" }, el("a", { href: "#" + h.id, textContent: h.firstChild.textContent.trim() }))));
    $("wikiToc").hidden = headings.length < 2;
    spy();
  }
  function spy() {
    if (!current) return;
    let active = null;
    headings.forEach(h => { if (h.getBoundingClientRect().top <= 110) active = h; });
    $("tocList").querySelectorAll("a").forEach((a, i) => a.classList.toggle("active", headings[i] === active));
    $("backTop").hidden = window.scrollY < 700;
  }
  let ticking = false;
  window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; spy(); }); } }, { passive: true });

  // ---- Routing: #page-id or #any-heading-id ----
  function resolve() {
    let hash = "";
    try { hash = decodeURIComponent(location.hash.slice(1)); } catch { hash = ""; }
    if (!hash) return { page: pages[0], target: null };
    const direct = pages.find(page => page.id === hash);
    if (direct) return { page: direct, target: null };
    const target = document.getElementById(hash);
    const owner = target?.closest("article.doc-page");
    return owner ? { page: owner, target } : { page: pages[0], target: null };
  }
  function route() {
    const { page, target } = resolve();
    const changed = page !== current;
    if (changed) {
      current = page;
      pages.forEach(p => p.classList.toggle("active", p === page));
      document.title = page.dataset.title + " · " + SITE;
      renderNav(); renderToc();
    }
    if (target) target.scrollIntoView({ block: "start" });
    else if (changed) { window.scrollTo(0, 0); page.querySelector("h1")?.focus({ preventScroll: true }); }
    document.body.classList.remove("nav-open");
    spy();
  }
  pages.forEach(page => page.querySelector("h1").tabIndex = -1);
  window.addEventListener("hashchange", route);
  document.body.classList.add("wiki-ready");
  route();

  // ---- Mobile navigation ----
  $("menuToggle").addEventListener("click", () => {
    const open = document.body.classList.toggle("nav-open");
    $("menuToggle").setAttribute("aria-expanded", String(open));
  });
  $("scrim").addEventListener("click", () => document.body.classList.remove("nav-open"));
  $("backTop").addEventListener("click", () => window.scrollTo({ top: 0 }));

  // ---- Search ----
  const dialog = $("searchDialog"), input = $("searchInput"), results = $("searchResults");
  let selected = 0, shown = [];
  const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function highlight(text, terms) {
    const out = document.createDocumentFragment();
    if (!terms.length) { out.append(text); return out; }
    text.split(new RegExp("(" + terms.map(escapeRegExp).join("|") + ")", "ig")).forEach(part => {
      if (part && terms.some(term => term.toLowerCase() === part.toLowerCase())) out.append(el("mark", { textContent: part }));
      else if (part) out.append(part);
    });
    return out;
  }
  function snippet(item, terms) {
    const lower = item.text.toLowerCase();
    const at = terms.map(term => lower.indexOf(term)).filter(i => i >= 0).sort((a, b) => a - b)[0];
    if (at === undefined) return item.text.slice(0, 130);
    const start = Math.max(0, at - 50);
    return (start ? "… " : "") + item.text.slice(start, start + 150) + (start + 150 < item.text.length ? " …" : "");
  }
  function search(query) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return pages.filter(page => ["quick-start", "case-workflow", "quality", "backup", "escalation", "troubleshooting"].includes(page.id)).map(page => ({ id: page.id, title: page.dataset.title, page: page.dataset.group, text: "", suggested: true }));
    return index.filter(item => terms.every(term => item.haystack.includes(term))).map(item => {
      const title = item.title.toLowerCase();
      let score = terms.reduce((sum, term) => sum + (title.includes(term) ? 10 : 0) + (item.page.toLowerCase().includes(term) ? 3 : 0) + Math.min(5, item.haystack.split(term).length - 1), 0);
      if (item.id === item.page.toLowerCase().replace(/\s+/g, "-")) score += 1;
      return { ...item, score };
    }).sort((a, b) => b.score - a.score).slice(0, 25);
  }
  function renderResults() {
    const query = input.value.trim();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    shown = search(query);
    results.replaceChildren();
    if (!shown.length) { results.append(el("li", { className: "search-empty", textContent: "No results for “" + query + "”. Try fewer or different words." })); return; }
    if (!terms.length) results.append(el("li", { className: "search-hint", textContent: "Suggested pages" }));
    selected = Math.min(selected, shown.length - 1);
    shown.forEach((item, i) => {
      const link = el("a", { className: "search-hit", href: "#" + item.id, role: "option" },
        el("div", { className: "hit-title" }, highlight(item.title, terms)),
        el("div", { className: "hit-path", textContent: item.page === item.title ? "" : item.page }),
        item.text ? el("div", { className: "hit-snippet" }, highlight(snippet(item, terms), terms)) : null);
      link.setAttribute("aria-selected", String(i === selected));
      link.addEventListener("click", () => dialog.close());
      link.addEventListener("mousemove", () => select(i, false));
      results.append(el("li", {}, link));
    });
  }
  function select(i, scroll = true) {
    const hits = [...results.querySelectorAll(".search-hit")];
    if (!hits.length) return;
    selected = (i + hits.length) % hits.length;
    hits.forEach((hit, n) => hit.setAttribute("aria-selected", String(n === selected)));
    if (scroll) hits[selected].scrollIntoView({ block: "nearest" });
  }
  function openSearch(prefill = "") { selected = 0; input.value = prefill; renderResults(); dialog.showModal(); input.focus(); input.select(); }
  $("searchTrigger").addEventListener("click", () => openSearch());
  input.addEventListener("input", () => { selected = 0; renderResults(); });
  input.addEventListener("keydown", event => {
    if (event.key === "ArrowDown") { event.preventDefault(); select(selected + 1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); select(selected - 1); }
    else if (event.key === "Enter") { const hit = results.querySelectorAll(".search-hit")[selected]; if (hit) { event.preventDefault(); const href = hit.getAttribute("href"); dialog.close(); if (location.hash === href) route(); else location.hash = href; } }
  });
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  document.addEventListener("keydown", event => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable;
    if (((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") || (event.key === "/" && !typing && !dialog.open)) { event.preventDefault(); if (!dialog.open) openSearch(); }
    else if (event.key === "Escape") document.body.classList.remove("nav-open");
  });

  // ---- Screenshot viewer ----
  const viewer = $("lightbox"), viewerImage = $("lightboxImage"), viewerCaption = $("lightboxCaption");
  let gallery = [], galleryAt = 0;
  function showImage(i) {
    galleryAt = (i + gallery.length) % gallery.length;
    const img = gallery[galleryAt];
    viewerImage.src = img.currentSrc || img.src;
    viewerImage.alt = img.alt;
    viewerCaption.textContent = (img.closest("figure")?.querySelector("figcaption")?.textContent || img.alt).replace(/^Figure:\s*/, "") + `  (${galleryAt + 1} of ${gallery.length})`;
  }
  function openImage(img) {
    gallery = [...current.querySelectorAll("figure.shot img")];
    showImage(Math.max(0, gallery.indexOf(img)));
    $("lightboxPrev").hidden = $("lightboxNext").hidden = gallery.length < 2;
    viewer.showModal();
  }
  document.querySelectorAll("figure.shot img").forEach(img => {
    img.tabIndex = 0; img.setAttribute("role", "button"); img.setAttribute("aria-label", "Enlarge screenshot: " + img.alt);
    img.addEventListener("click", () => openImage(img));
    img.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openImage(img); } });
  });
  $("lightboxClose").addEventListener("click", () => viewer.close());
  $("lightboxPrev").addEventListener("click", () => showImage(galleryAt - 1));
  $("lightboxNext").addEventListener("click", () => showImage(galleryAt + 1));
  viewer.addEventListener("click", event => { if (event.target === viewer) viewer.close(); });
  viewer.addEventListener("keydown", event => { if (event.key === "ArrowLeft" && gallery.length > 1) showImage(galleryAt - 1); else if (event.key === "ArrowRight" && gallery.length > 1) showImage(galleryAt + 1); });

  // ---- Copy buttons on code blocks ----
  document.querySelectorAll("pre").forEach(pre => {
    const button = el("button", { className: "copy-btn", type: "button", textContent: "Copy" });
    button.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(pre.querySelector("code")?.textContent ?? pre.textContent); button.textContent = "Copied"; }
      catch { button.textContent = "Press Ctrl+C"; getSelection().selectAllChildren(pre); }
      setTimeout(() => { button.textContent = "Copy"; }, 1800);
    });
    pre.append(button);
  });
})();
