"use strict";
// The Recent cases list in Case Notes: Grid/List view, search (optionally across Archive and Trash), filters, sort,
// follow-up colors and each card's actions. case-notes.js calls render() whenever the list may have changed, and
// renderSoon() while someone is typing in a case.
window.CaseHistoryList = (() => {
  // page: { state(), writable(), copying(), save(), select(id), commitCaseChange(change, failure), showStoredCase(note, collection),
  //         status(text), report(message), scheduleBackup(), refreshAssist() }
  function init(page) {
    const $ = id => document.getElementById(id);
    // Recent cases as cards (Grid, the default) or compact one-line rows (List).
    const historyViewKey = "dell-support.case-history-view";
    let historyView = "grid";
    try { if (localStorage.getItem(historyViewKey) === "list") historyView = "list"; } catch { /* Use the grid default. */ }
    function setHistoryView(view, persist) {
      historyView = view === "list" ? "list" : "grid";
      $("historyList").classList.toggle("history-compact", historyView === "list");
      $("historyViewList").setAttribute("aria-pressed", String(historyView === "list"));
      $("historyViewGrid").setAttribute("aria-pressed", String(historyView === "grid"));
      if (!persist) return;
      try { localStorage.setItem(historyViewKey, historyView); } catch { /* Still works for this visit. */ }
      page.scheduleBackup();
      render();
    }
    setHistoryView(historyView, false);
    $("historyViewList").addEventListener("click", () => setHistoryView("list", true));
    $("historyViewGrid").addEventListener("click", () => setHistoryView("grid", true));
    // SR number or Service Tag when known; otherwise the start of the issue description and the date, so untitled
    // cases can still be told apart (especially in the title-only List view).
    function caseListTitle(note) {
      if (note.request || note.tag) return note.request || note.tag;
      const date = new Date(note.created).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const words = CaseNotes.plainText(note.issue || "").trim().split(/\s+/).filter(Boolean);
      if (!words.length) return "Untitled case · " + date;
      const start = words.slice(0, 6).join(" ");
      return (start.length > 48 ? start.slice(0, 47) : start) + (words.length > 6 || start.length > 48 ? "…" : "") + " · " + date;
    }
    // The Filters button shows how many of Show cases, Collection and Sort differ from their defaults.
    function updateFilterSummary() {
      const changed = [$("followupFilter")?.value !== "all", $("caseCollection")?.value !== "cases", $("caseSort")?.value !== "created"].filter(Boolean).length;
      if ($("filterCount")) $("filterCount").textContent = changed ? ` (${changed})` : "";
    }
    // Typing in a case redraws the list once the typing pauses rather than on every keystroke: redrawing 100 cards
    // takes about a frame. Like the minute refresh below, it waits while a card has keyboard focus.
    let pending = null;
    function renderSoon() {
      clearTimeout(pending);
      pending = setTimeout(() => { pending = null; if (!$("historyList").contains(document.activeElement)) render(); }, 300);
    }
    function render() {
      clearTimeout(pending); pending = null;
      const query = $("search").value.trim().toLowerCase();
      const filter = $("followupFilter").value || "all";
      const viewCollection = ["archive","trash"].includes($("caseCollection")?.value) ? $("caseCollection").value : "cases";
      const sort = $("caseSort")?.value || "created";
      const now = Date.now();
      // "Search Archive and Trash too" widens a search to every collection; each result remembers where it lives.
      const everywhere = !!query && !!$("searchEverywhere")?.checked;
      const where = new Map();
      for (const name of everywhere ? ["cases","archive","trash"] : [viewCollection]) for (const note of page.state()[name] || []) where.set(note, name);
      updateFilterSummary();
      const matches = [...where.keys()].filter(note => {
        const status = note.toolkit?.status || "Open";
        return (!query || CaseNotes.searchText(note).toLowerCase().includes(query)) && (filter === "all" || filter === "overdue" && CaseToolkitCore.overdue(note, now) || filter === "soon" && CaseToolkitCore.dueSoon(note, now) || filter === "active" && status !== "Completed" || filter === "completed" && status === "Completed");
      }).sort((a,b) => Number(!!b.pinned)-Number(!!a.pinned) || (sort === "due" ? (Date.parse(a.toolkit?.due) || Infinity)-(Date.parse(b.toolkit?.due) || Infinity) : b[sort === "updated" ? "updated" : "created"]-a[sort === "updated" ? "updated" : "created"]));
      $("caseCount").textContent = viewCollection === "cases" ? `${page.state().cases.length} / 100` : `${page.state()[viewCollection].length} ${viewCollection === "archive" ? "archived" : "in Trash"}`;
      $("historyList").replaceChildren(...matches.map(note => {
        const collection = where.get(note);
        const button = document.createElement("button"); button.className = "case-item";
        button.setAttribute("aria-current", String(note.id === page.state().selected));
        button.disabled = page.copying();
        const title = document.createElement("strong"); title.textContent = (CaseExample.isSample(note.id) ? "Sample · " : "") + caseListTitle(note);
        if (historyView === "list") button.title = title.textContent;
        const issue = document.createElement("span"); issue.textContent = query ? CaseNotes.excerpt(note,query) : note.issue || "No issue description yet";
        const meta = document.createElement("small"); meta.textContent = `${note.tag ? note.tag + " · " : ""}${historyView === "list" ? new Date(note.created).toLocaleDateString() : new Date(note.created).toLocaleString()}`;
        button.append(title, issue, meta);
        if (collection !== viewCollection) {
          const place = document.createElement("small"); place.className = "case-collection-badge";
          place.textContent = collection === "archive" ? "In Archive" : collection === "trash" ? "In Trash" : "In Recent cases";
          button.append(place);
        }
        // Red when the follow-up is overdue, yellow when it is due within 4 hours.
        const followup = CaseToolkitCore.followupState(note, now);
        if (followup) { button.classList.toggle("followup-" + followup, true); button.title = [button.title, followup === "overdue" ? "Follow-up overdue" : "Follow-up due within 4 hours"].filter(Boolean).join(" · "); }
        if (note.toolkit) {
          const badge = document.createElement("small");
          const late = followup === "overdue";
          badge.className = followup ? "followup-badge " + followup : "followup-badge";
          badge.textContent = `${late ? "Overdue · " : followup === "soon" ? "Due soon · " : ""}${note.toolkit.status}${note.toolkit.owner ? " · " + note.toolkit.owner : ""}${note.toolkit.due ? " · " + new Date(note.toolkit.due).toLocaleString() : ""}`;
          button.append(badge);
        }
        const row = document.createElement("div"); row.className = "case-row";
        const remove = document.createElement("button");
        remove.className = "delete-case"; remove.type = "button";
        const caseName = note.tag || note.request || "Untitled case";
        remove.setAttribute("aria-label", "Delete case " + caseName);
        remove.title = collection === "trash" ? "Permanently delete this case" : "Move case to Trash";
        remove.disabled = !page.writable() || page.copying();
        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.setAttribute("viewBox", "0 0 24 24"); icon.setAttribute("aria-hidden", "true");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7");
        icon.append(path); remove.append(icon);
        remove.addEventListener("click", async () => {
          if (!page.writable() || page.copying()) return;
          if (!confirm(collection === "trash" ? `Permanently delete ${caseName} and its versions? This cannot be undone.` : `Move ${caseName} to Trash? You can restore it later.`)) return;
          if (!page.writable() || page.copying() || !page.save()) return;
          const permanent = collection === "trash";
          if (!page.commitCaseChange(candidate => {
            if (permanent) { candidate.trash = candidate.trash.filter(item => item.id !== note.id); delete candidate.revisions[note.id]; }
            else CaseNotes.move(candidate,note.id,collection,"trash",Date.now());
          }, "Could not delete the case. Check browser storage and try again. Your case has not been removed.")) return;
          page.status("Saved");
          page.report(permanent ? `${caseName} was permanently deleted.` : `${caseName} moved to Trash. Choose Trash in the case list to restore it.`);
          $("copyStatus").textContent = "";
        });
        row.append(button, remove);
        const rowActions = document.createElement("div"); rowActions.className = "case-row-actions";
        const addAction = (label,action) => {
          const control = document.createElement("button"); control.type = "button"; control.className = "button secondary";
          control.textContent = label; control.disabled = !page.writable() || page.copying(); control.setAttribute("aria-label",label + " " + caseName);
          control.addEventListener("click",action); rowActions.append(control);
        };
        if (collection === "cases") {
          addAction(note.pinned ? "Unpin" : "Pin", () => page.commitCaseChange(candidate => { candidate.cases.find(item => item.id === note.id).pinned = !note.pinned; }));
          addAction("Archive", () => page.commitCaseChange(candidate => CaseNotes.move(candidate,note.id,"cases","archive",Date.now())));
          if (followup) addAction("Follow-up done", async () => {
            const choice = await window.CaseToolkit?.finishFollowup(note, change => page.commitCaseChange(candidate => { change(candidate.cases.find(item => item.id === note.id)); }));
            if (!choice) return;
            page.report(choice === "new" ? `Follow-up recorded for ${caseName}. Set the next follow-up.` : choice === "none" ? `Follow-up recorded for ${caseName}. No further follow-up is scheduled.` : `Follow-up recorded. ${caseName} is marked Completed.`);
            if (choice !== "new") return;
            // Open the case's follow-up tracker so the next due date can be set straight away.
            page.select(note.id);
            $("actionPlanFollowup")?.click();
            $("followupDue")?.focus();
            $("toolkitStatus").textContent = "Follow-up recorded. Set the date and time for the next follow-up.";
          });
        } else addAction("Restore", () => page.commitCaseChange(candidate => CaseNotes.move(candidate,note.id,collection,"cases",Date.now())));
        row.append(rowActions);
        button.addEventListener("click", () => {
          if (collection !== "cases") { page.showStoredCase(note,collection); return; }
          page.select(note.id);
        }); return row;
      }));
      page.refreshAssist();
      if (!matches.length) $("historyList").textContent = query ? (everywhere ? "No matching cases in any collection." : "No matching cases. Tick “Search Archive and Trash too” to look further.") : "No cases yet.";
    }
    $("search").addEventListener("input", render);
    $("caseCollection")?.addEventListener("change", render);
    $("caseSort")?.addEventListener("change", render);
    $("searchEverywhere")?.addEventListener("change", render);
    $("toggleHistoryFilters")?.addEventListener("click", () => {
      const open = $("historyFilters").hidden;
      $("historyFilters").hidden = !open;
      $("toggleHistoryFilters").setAttribute("aria-expanded", String(open));
      try { localStorage.setItem("dell-support.case-filters-open", String(open)); } catch { /* Still works for this visit. */ }
    });
    try { if (localStorage.getItem("dell-support.case-filters-open") === "true") { $("historyFilters").hidden = false; $("toggleHistoryFilters").setAttribute("aria-expanded", "true"); } } catch { /* Closed by default. */ }
    $("followupFilter").addEventListener("change", render);
    setInterval(() => { if (!$("historyList").contains(document.activeElement)) render(); }, 60000);
    return { render, renderSoon };
  }
  return { init };
})();
