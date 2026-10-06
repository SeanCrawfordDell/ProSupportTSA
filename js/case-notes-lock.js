"use strict";
// One Case Notes editor at a time, across tabs and the pop-out window (Web Locks). A read-only tab waits in line and
// becomes editable by itself when the editing tab closes, or takes over straight away: the editing tab is asked to
// save first, then switches to read-only and waits its turn. The page supplies what happens while it holds the lock.
window.CaseNotesLock = (() => {
  const $ = id => document.getElementById(id);
  const lockName = "dell-support.case-notes.editor";
  // page: { prepare() → false to stop (load failed), hold() → resolves when this tab gives the lock up,
  //         lost() (stop editing; the page redraws read-only), editing() → true while this tab can edit, saveNow() }
  function create(page) {
    let wait = null, channel = null;
    try { channel = new BroadcastChannel("dell-support.case-notes.lock"); channel.onmessage = event => { if (event.data === "save-now" && page.editing()) page.saveNow(); }; } catch { /* Take over still works; the other tab's last autosave is used. */ }
    function notice(text) { $("lockNotice").hidden = false; $("lockNotice").textContent = text; }
    function readOnly(text) { notice(text); if ($("takeOverEditing")) $("takeOverEditing").hidden = false; }
    function hold() { if ($("takeOverEditing")) $("takeOverEditing").hidden = true; return page.hold(); }
    function waitInLine() {
      if (wait || page.editing()) return;
      const controller = wait = new AbortController();
      navigator.locks.request(lockName, { signal: controller.signal }, () => { wait = null; return hold(); })
        // Aborted while still waiting means this tab is taking over instead; any other failure (including the lock
        // being taken after it was granted) switches the tab to read-only.
        .catch(error => { if (controller.signal.aborted) return; lost(error); });
    }
    // The lock was taken by another tab (or could not be requested): stop editing here and wait for it again.
    function lost(error) {
      page.lost();
      if (error?.name !== "AbortError") { notice("Unable to acquire the editor lock. Reload to try again."); return; }
      readOnly("Editing moved to another tab or window, so this tab is now read-only. It becomes editable again when that one closes, or choose Take over editing here.");
      waitInLine();
    }
    async function acquire() {
      const ready = page.prepare();
      if (!navigator.locks) {
        if (ready) notice("Read-only: this browser cannot protect notes against simultaneous editing. Open this site over HTTPS or localhost in a browser supporting Web Locks.");
        return;
      }
      if (ready) notice("Checking whether another tab is editing Case Notes…");
      try {
        await navigator.locks.request(lockName, { ifAvailable: true }, async lock => {
          if (lock === null) { readOnly("Read-only while another tab is editing Case Notes. This tab becomes editable when that tab closes, or choose Take over editing here."); waitInLine(); return; }
          await hold();
        });
      } catch (error) { lost(error); }
    }
    $("takeOverEditing")?.addEventListener("click", async () => {
      if (page.editing()) return;
      $("takeOverEditing").disabled = true;
      channel?.postMessage("save-now");
      await new Promise(resolve => setTimeout(resolve, 400));
      wait?.abort(); wait = null;
      try { await navigator.locks.request(lockName, { steal: true }, hold); }
      catch (error) { if (error?.name === "AbortError") lost(error); }
      finally { $("takeOverEditing").disabled = false; }
    });
    return { acquire };
  }
  return { create };
})();
