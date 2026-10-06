"use strict";
// Case Notes helpers that sit beside the main page script: keyboard shortcuts, follow-up alerts (tab title, header
// pill, optional desktop notifications), the away-time prompt for the timer, the duplicate Service Request warning
// and the Notes-first layout. case-notes.js passes in the few page functions these need.
window.CaseNotesAssist = (() => {
  const $ = id => document.getElementById(id);
  const keys = { notesFirst: "dell-support.notes-first", idle: "dell-support.idle-prompt", notify: "dell-support.followup-notify", notified: "dell-support.followup-notified" };
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); return true; } catch { return false; } };
  let api, baseTitle = "";

  // Alt+Shift+letter (Option+Shift on a Mac). event.code is used because Option changes the typed character.
  const shortcuts = [
    { code: "KeyC", label: "Copy to Lightning", run: () => $("copyNote")?.click() },
    { code: "KeyN", label: "Add a dated note to this case", run: () => $("newCaseEntry")?.click() },
    { code: "KeyK", label: "Start a new case", run: () => $("newNote")?.click() },
    { code: "KeyJ", label: "Jump to Notes", run: () => jumpToNotes() },
    { code: "KeyF", label: "Search cases (opens Recent cases)", run: null }
  ];
  function onShortcut(event) {
    if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return;
    const shortcut = shortcuts.find(item => item.code === event.code);
    if (!shortcut?.run || document.querySelector("dialog[open]")) return;
    event.preventDefault();
    shortcut.run();
  }
  function jumpToNotes() {
    const section = $("notesSection");
    if (!section || $("noteEditor")?.hidden) return;
    if (section.classList.contains("collapsed")) $("notesToggle")?.click();
    section.scrollIntoView({ block: "start", behavior: "smooth" });
    ($("notesRich") || $("notes"))?.focus({ preventScroll: true });
  }

  // Notes and Action Plan above Case workflow and Case Details, for people who mostly write.
  function setNotesFirst(on) {
    const details = $("caseDetailsSection"), notes = $("notesSection"), plan = $("actionPlanSection"), workflow = $("workflow"), form = $("noteForm");
    if (!details || !notes || !plan || !workflow || !form) return;
    if (on) { plan.after(details); form.after(workflow); }
    else { notes.before(details); form.before(workflow); }
    $("noteEditor")?.classList.toggle("notes-first", on);
  }

  // Follow-up alerts: the tab title, a header pill that filters Recent cases, and optional desktop notifications.
  function followupCounts(now = Date.now()) {
    const counts = { overdue: [], soon: [] };
    for (const note of api.cases()) {
      const state = CaseToolkitCore.followupState(note, now);
      if (state) counts[state === "overdue" ? "overdue" : "soon"].push(note);
    }
    return counts;
  }
  function refreshFollowups(now = Date.now()) {
    if (!api) return;
    const { overdue, soon } = followupCounts(now), total = overdue.length + soon.length;
    document.title = (total ? `(${total}) ` : "") + baseTitle;
    const pill = $("followupAlert");
    if (pill) {
      pill.hidden = !total;
      pill.classList.toggle("overdue", overdue.length > 0);
      pill.textContent = [overdue.length && `${overdue.length} overdue`, soon.length && `${soon.length} due within 4 hours`].filter(Boolean).join(" · ");
      pill.title = "Show " + (overdue.length ? "overdue follow-ups" : "follow-ups due within 4 hours") + " in Recent cases";
    }
    notify(overdue, soon);
  }
  function notificationsAllowed() { return read(keys.notify) === "true" && typeof Notification !== "undefined" && Notification.permission === "granted"; }
  // Each case is announced once per due time and state (due soon, then overdue).
  function notify(overdue, soon) {
    if (!notificationsAllowed()) return;
    let sent = {};
    try { sent = JSON.parse(read(keys.notified) || "{}") || {}; } catch { sent = {}; }
    const live = {};
    for (const [list, label] of [[overdue, "overdue"], [soon, "soon"]]) for (const note of list) {
      const id = `${note.id}|${note.toolkit.due}|${label}`;
      live[id] = true;
      if (sent[id]) continue;
      try {
        const name = note.request || note.tag || "A case";
        const message = new Notification(label === "overdue" ? `Follow-up overdue: ${name}` : `Follow-up due soon: ${name}`, {
          body: `Due ${new Date(note.toolkit.due).toLocaleString()}${note.toolkit.owner ? " · " + note.toolkit.owner : ""}`, tag: "case-followup-" + note.id
        });
        message.onclick = () => { window.focus(); api.open(note.id); message.close(); };
      } catch { /* Notifications blocked; the tab title and pill still show it. */ }
    }
    write(keys.notified, JSON.stringify(live));
  }
  async function setNotify(on, box) {
    if (on) {
      if (typeof Notification === "undefined") { box.checked = false; return "This browser cannot show desktop notifications."; }
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") { box.checked = false; write(keys.notify, "false"); return "Notifications are blocked for this site. Allow them in the browser's site settings, then try again."; }
    }
    write(keys.notify, String(on));
    refreshFollowups();
    return on ? "You will get a desktop notification when a follow-up is due within 4 hours and when it is overdue." : "Follow-up desktop notifications turned off.";
  }

  // Away time: with permission, the browser reports when this computer has been idle for 15 minutes or locked.
  // When the person comes back with the timer still running, they choose whether to keep that time.
  let idleDetector = null, idleController = null, awaySince = null;
  const idleThreshold = 15 * 60 * 1000;
  async function startIdle() {
    if (idleDetector || typeof IdleDetector === "undefined") return;
    try {
      idleController = new AbortController();
      idleDetector = new IdleDetector();
      idleDetector.addEventListener("change", onIdleChange);
      await idleDetector.start({ threshold: idleThreshold, signal: idleController.signal });
    } catch { idleDetector = null; idleController = null; }
  }
  function stopIdle() { idleController?.abort(); idleDetector = null; idleController = null; awaySince = null; }
  async function onIdleChange() {
    const away = idleDetector.userState === "idle" || idleDetector.screenState === "locked";
    if (away) {
      // The detector reports idle once the threshold has passed, so the away time began that long ago.
      if (awaySince === null && api.timerRunning()) awaySince = Date.now() - (idleDetector.userState === "idle" ? idleThreshold : 0);
      return;
    }
    if (awaySince === null) return;
    const from = awaySince, minutes = Math.round((Date.now() - from) / 60000);
    awaySince = null;
    if (!api.timerRunning() || minutes < 1) return;
    const choice = await api.ask({ title: "Welcome back", message: `You were away for about ${minutes} minute${minutes === 1 ? "" : "s"} while the case timer was running. Keep that time on the case?`,
      buttons: [{ label: "Keep the time", value: "keep" }, { label: "Remove the away time", value: "discard", primary: true }] });
    if (choice === "discard") api.discardTime(from, Date.now());
  }
  async function setIdle(on, box) {
    if (on) {
      if (typeof IdleDetector === "undefined") { box.checked = false; return "This browser cannot tell when the computer is idle."; }
      let permission = "denied";
      try { permission = await IdleDetector.requestPermission(); } catch { permission = "denied"; }
      if (permission !== "granted") { box.checked = false; write(keys.idle, "false"); return "Idle detection is blocked for this site. Allow it in the browser's site settings, then try again."; }
      write(keys.idle, "true"); await startIdle();
      return "When you come back after 15 minutes away with the timer running, you will be asked whether to keep that time.";
    }
    write(keys.idle, "false"); stopIdle();
    return "Away-time prompt turned off.";
  }

  // Warn when the Service Request number is already used by another case, in any collection.
  function checkDuplicate() {
    const note = api.selected(), box = $("requestDuplicate");
    if (!box) return;
    const request = (note?.request || "").replace(/\s+/g, "").toLowerCase();
    const match = request && api.allCases().find(item => item.note.id !== note.id && (item.note.request || "").replace(/\s+/g, "").toLowerCase() === request);
    box.hidden = !match;
    if (!match) return;
    const where = { cases: "Recent cases", archive: "Archive", trash: "Trash" }[match.collection];
    $("requestDuplicateText").textContent = `This Service Request number is already used by another case (${where}, created ${new Date(match.note.created).toLocaleDateString()}).`;
    $("openDuplicate").onclick = () => api.open(match.note.id, match.collection);
  }

  function initOptions() {
    const options = [
      ["notesFirstToggle", keys.notesFirst, on => { setNotesFirst(on); return on ? "Notes and Action Plan now come first." : "Case workflow and Case Details now come first."; }, true],
      ["idlePromptToggle", keys.idle, setIdle, typeof IdleDetector !== "undefined"],
      ["followupNotifyToggle", keys.notify, setNotify, typeof Notification !== "undefined"]
    ];
    for (const [id, key, apply, supported] of options) {
      const box = $(id);
      if (!box) continue;
      const row = box.closest(".customizer-check");
      if (row) row.hidden = !supported;
      box.checked = read(key) === "true";
      box.addEventListener("change", async () => {
        const message = await apply(box.checked, box);
        if (id === "notesFirstToggle") write(key, String(box.checked));
        if ($("customizerStatus")) $("customizerStatus").textContent = message;
        api.backup?.();
      });
    }
    $("shortcutList")?.replaceChildren(...shortcuts.map(item => {
      const row = document.createElement("li"), keysText = document.createElement("kbd");
      keysText.textContent = "Alt+Shift+" + item.code.slice(3);
      row.append(keysText, " " + item.label);
      return row;
    }));
  }
  function refreshOptions() {
    for (const [id, key] of [["notesFirstToggle", keys.notesFirst], ["idlePromptToggle", keys.idle], ["followupNotifyToggle", keys.notify]]) if ($(id)) $(id).checked = read(key) === "true";
  }

  function init(options) {
    api = options;
    baseTitle = document.title.replace(/^\(\d+\) /, "");
    document.addEventListener("keydown", onShortcut);
    $("jumpToNotes")?.addEventListener("click", jumpToNotes);
    $("followupAlert")?.addEventListener("click", () => {
      const { overdue } = followupCounts();
      api.showFollowups(overdue.length ? "overdue" : "soon");
    });
    $("request")?.addEventListener("input", checkDuplicate);
    initOptions();
    if (read(keys.notesFirst) === "true") setNotesFirst(true);
    if (read(keys.idle) === "true") startIdle();
    for (const [code, shortcut] of [["copyNote", "Alt+Shift+C"], ["newCaseEntry", "Alt+Shift+N"], ["newNote", "Alt+Shift+K"], ["jumpToNotes", "Alt+Shift+J"]]) $(code)?.setAttribute("aria-keyshortcuts", shortcut);
    refreshFollowups();
    return { refresh() { refreshFollowups(); checkDuplicate(); }, refreshOptions, jumpToNotes, setNotesFirst };
  }
  return { init, keys, shortcuts };
})();
