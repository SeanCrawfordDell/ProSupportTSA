"use strict";
// Inline Case Details layout: unlock the grid, drag fields (or move them with the arrow keys), then Done saves the order.
window.CaseFieldLayout = (() => {
  let grid, toggle, cancelButton, status, options, snapshot = null, drag = null;
  const editing = () => snapshot !== null;
  const items = () => Array.from(grid.children).filter(child => options.fieldId(child));
  const order = () => items().map(item => options.fieldId(item));
  const nameOf = item => options.label(options.fieldId(item));
  const announce = text => { status.textContent = text; };
  const grip = item => item.querySelector(":scope > .field-grip");
  // Fields sit together at the start of the grid; anything after them stays where it is.
  function place(ids) {
    const list = items(), byId = new Map(list.map(item => [options.fieldId(item), item]));
    const anchor = list.at(-1)?.nextSibling ?? null;
    ids.forEach(id => { if (byId.has(id)) grid.insertBefore(byId.get(id), anchor); });
  }
  function position(item) {
    const list = items();
    announce(`${nameOf(item)} moved to position ${list.indexOf(item) + 1} of ${list.length}.`);
  }
  function setEditing(on) {
    grid.classList.toggle("layout-editing", on);
    for (const item of items()) {
      grip(item)?.remove();
      item.querySelectorAll("input, select, textarea").forEach(control => { control.inert = on; });
      if (!on) continue;
      // A span, not a button: a button inside the <label> would become the label's control.
      const handle = document.createElement("span");
      handle.className = "field-grip";
      handle.tabIndex = 0;
      handle.setAttribute("role", "button");
      handle.setAttribute("aria-label", `Move ${nameOf(item)}. Use the arrow keys, or drag the field.`);
      handle.textContent = "⋮⋮";
      item.prepend(handle);
    }
    toggle.textContent = on ? "Done" : "Unlock layout";
    toggle.setAttribute("aria-pressed", String(on));
    cancelButton.hidden = !on;
  }
  function endDrag(revert) {
    if (!drag) return;
    const { item, ghost, before } = drag;
    drag = null;
    ghost.remove();
    item.classList.remove("field-dragging");
    if (revert) { place(before); return; }
    if (order().join() !== before.join()) position(item);
    grip(item)?.focus({ preventScroll: true });
  }
  function startDrag(event) {
    const item = event.target.closest?.(".field");
    if (!editing() || drag || event.button !== 0 || !item || item.parentElement !== grid || !options.fieldId(item)) return;
    event.preventDefault();
    const rect = item.getBoundingClientRect();
    const ghost = item.cloneNode(true);
    ghost.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
    ghost.classList.add("field-ghost");
    ghost.setAttribute("aria-hidden", "true");
    ghost.inert = true;
    Object.assign(ghost.style, { width: rect.width + "px", height: rect.height + "px", left: rect.left + "px", top: rect.top + "px" });
    document.body.append(ghost);
    item.classList.add("field-dragging");
    drag = { item, ghost, before: order(), pointer: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    grid.setPointerCapture?.(event.pointerId);
  }
  function moveDrag(event) {
    if (!drag || event.pointerId !== drag.pointer) return;
    drag.ghost.style.left = event.clientX - drag.dx + "px";
    drag.ghost.style.top = event.clientY - drag.dy + "px";
    const target = items().find(item => {
      if (item === drag.item) return false;
      const r = item.getBoundingClientRect();
      return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
    });
    if (target) {
      // Wide fields span both columns, so their halves are top and bottom instead of left and right.
      const r = target.getBoundingClientRect(), wide = r.width > grid.getBoundingClientRect().width * 0.75;
      const after = wide ? event.clientY > r.top + r.height / 2 : event.clientX > r.left + r.width / 2;
      grid.insertBefore(drag.item, after ? target.nextSibling : target);
    }
    if (event.clientY < 48) window.scrollBy(0, -12);
    else if (event.clientY > window.innerHeight - 48) window.scrollBy(0, 12);
  }
  function onKey(event) {
    const handle = event.target.closest?.(".field-grip");
    if (!editing() || !handle) return;
    if (event.key === "Escape") { event.preventDefault(); cancel(); toggle.focus(); return; }
    const step = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const item = handle.parentElement, list = items(), target = list[list.indexOf(item) + step];
    if (!target) { announce(`${nameOf(item)} is already ${step < 0 ? "first" : "last"}.`); return; }
    grid.insertBefore(item, step < 0 ? target : target.nextSibling);
    handle.focus();
    position(item);
  }
  function unlock() {
    if (editing() || !options.canEdit()) return;
    options.expand?.();
    snapshot = order();
    setEditing(true);
    announce("Layout unlocked. Drag fields, or focus a grip and use the arrow keys. Choose Done to save the order.");
    grip(items()[0])?.focus();
  }
  function lock() {
    endDrag(true);
    snapshot = null;
    setEditing(false);
  }
  function done() {
    if (!editing()) return;
    endDrag(false);
    const before = snapshot, next = order();
    lock();
    if (next.join() === before.join()) { announce("Layout locked. The field order is unchanged."); return; }
    if (options.save(next)) { announce("Field order saved."); return; }
    place(before);
    announce("Could not save the field order. The previous order was kept.");
  }
  function cancel(message = "Layout changes discarded.") {
    if (!editing()) return;
    endDrag(true);
    place(snapshot);
    lock();
    announce(message);
  }
  function init(config) {
    ({ grid, toggle, cancel: cancelButton, status } = config);
    options = config;
    toggle.addEventListener("click", () => (editing() ? done() : unlock()));
    cancelButton.addEventListener("click", () => { cancel(); toggle.focus(); });
    grid.addEventListener("pointerdown", startDrag);
    grid.addEventListener("pointermove", moveDrag);
    grid.addEventListener("pointerup", event => { if (drag && event.pointerId === drag.pointer) endDrag(false); });
    grid.addEventListener("pointercancel", () => endDrag(true));
    grid.addEventListener("keydown", onKey);
    refresh();
    return api;
  }
  // Called when editing rights change: a read-only page, a copy in progress, or no case selected locks the layout.
  function refresh() {
    if (!grid) return;
    const allowed = options.canEdit();
    toggle.disabled = !allowed;
    if (!allowed) cancel("Layout locked. Unsaved order changes were discarded.");
  }
  // Called before the page redraws the grid, which would otherwise rebuild it from the saved order.
  function discard() { if (grid) cancel("Layout locked. Unsaved order changes were discarded."); }
  const api = { init, refresh, discard, editing, unlock, done, cancel };
  return api;
})();
