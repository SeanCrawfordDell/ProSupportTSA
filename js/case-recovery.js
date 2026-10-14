"use strict";
// When saved case history cannot be read, Case Notes stays read-only so nothing overwrites it. This panel says why
// and offers a way out: download a copy, repair (keep everything that is still valid), or start fresh.
// Repair and Start fresh always download the original first and ask for a second confirmation.
window.CaseRecovery = (() => {
  const $ = id => document.getElementById(id);
  let page = null, raw = null, preview = null, pending = null;
  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const say = text => { $("recoveryStatus").textContent = text; };
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  function download(text) {
    const name = `case-notes-history-copy-${stamp()}.json`;
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = name;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return name;
  }
  // error: why parse() failed; text: what is stored (null when the browser blocked storage).
  function show(error, text) {
    raw = text; pending = null; $("recoveryConfirm").hidden = true; say("");
    $("recoveryPanel").hidden = false;
    const blocked = text === undefined;
    let newer = false;
    try { newer = !blocked && Number(JSON.parse(text)?.version) > 3; } catch { /* Not JSON; handled by repair() below. */ }
    preview = blocked || newer ? null : CaseNotes.repair(text, Date.now());
    $("recoveryReason").textContent = blocked
      ? "This browser is blocking site storage, so Case Notes cannot read or save anything. Allow cookies and site data for this site (Edge: Settings → Cookies and site permissions), then reload."
      : `Case Notes could not read the history saved in this browser (${error?.message || "unknown problem"}). Your notes are still stored here and nothing has been deleted. Editing is paused so nothing overwrites them.`;
    const list = $("recoverySetAside"); list.replaceChildren(); list.hidden = true;
    if (blocked) $("recoverySummary").textContent = "";
    else if (newer) $("recoverySummary").textContent = "It was saved by a newer version of Case Notes than this page. Reload with Ctrl+F5 to get the latest version before trying anything else.";
    else if (!preview) $("recoverySummary").textContent = "It cannot be repaired automatically. Download a copy to keep it, then restore a backup from Backup & Restore or start fresh.";
    else if (!preview.setAside.length) $("recoverySummary").textContent = `Repair keeps all ${plural(preview.kept, "case")} and fills in settings that older versions did not save.`;
    else {
      const one = preview.setAside.length === 1;
      $("recoverySummary").textContent = `Repair keeps ${plural(preview.kept, "case")}. ${one ? "This item cannot be loaded and will be left out (it stays" : `These ${preview.setAside.length} items cannot be loaded and will be left out (they stay`} in the copy that is downloaded first):`;
      list.replaceChildren(...preview.setAside.map(item => { const li = document.createElement("li"); li.textContent = `${item.where}${item.name ? ": " + item.name : ""} (${item.reason})`; return li; }));
      list.hidden = false;
    }
    $("recoveryRepair").hidden = !preview;
    $("recoveryDownload").hidden = blocked;
    $("recoveryFresh").hidden = blocked;
  }
  function hide() { $("recoveryPanel").hidden = true; raw = preview = pending = null; }
  // Repair and Start fresh: download the original, then wait for a second click.
  function ask(action) {
    const file = download(raw);
    pending = action;
    $("recoveryConfirmText").textContent = `A copy of the stored history was downloaded as ${file}. Check that it is in your Downloads folder, then ` +
      (action === "repair" ? "confirm the repair." : "confirm to start with an empty case history. Every stored case will be removed from this browser.");
    $("recoveryConfirmGo").textContent = action === "repair" ? "Confirm repair" : "Remove history and start fresh";
    $("recoveryConfirm").hidden = false; $("recoveryConfirmGo").focus();
  }
  function confirm() {
    const action = pending; pending = null; $("recoveryConfirm").hidden = true;
    let current;
    try { current = localStorage.getItem(page.key); } catch { say("This browser blocked site storage. Reload and try again."); return; }
    // Another tab may have changed the history since this panel was shown.
    if (current !== raw) { say("The stored history changed in another tab. Reload this page, then try again."); return; }
    try {
      if (action === "repair") localStorage.setItem(page.key, JSON.stringify(preview.state));
      else localStorage.removeItem(page.key);
    } catch { say("Could not save the change: browser storage may be full. Nothing was changed."); return; }
    const message = action === "repair" ? `Case history repaired: ${plural(preview.kept, "case")} kept.` : "Started fresh with an empty case history.";
    hide(); page.reopen(message);
  }
  function init(options) {
    page = options;
    $("recoveryRepair").addEventListener("click", () => ask("repair"));
    $("recoveryFresh").addEventListener("click", () => ask("fresh"));
    $("recoveryDownload").addEventListener("click", () => { const file = download(raw); say(`Downloaded ${file}. Keep it until your cases are back.`); });
    $("recoveryConfirmGo").addEventListener("click", confirm);
    $("recoveryConfirmCancel").addEventListener("click", () => { pending = null; $("recoveryConfirm").hidden = true; say("Nothing was changed."); });
  }
  return { init, show, hide };
})();
