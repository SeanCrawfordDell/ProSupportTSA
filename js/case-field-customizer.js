"use strict";
// Customize Site Options for Case Notes: the field customizer (add, reorder, hide custom and built-in fields), the
// inline Unlock layout wiring, hidden-field preferences and the Copy to Lightning effect toggle.
window.CaseFieldCustomizer = (() => {
  // page: { key, state(), replaceState(next), markDirty(), save(), render(), selected(), writable(), copying(),
  //         scheduleBackup(), safetyBefore(reason), refreshOptions() }
  function init(page) {
    const $ = id => document.getElementById(id), key = page.key;
    // Fields a user chose to hide from Case Details. A browser preference (included in settings backups), not case data.
    const hiddenKey = "dell-support.hidden-fields.v1", hiddenAckKey = "dell-support.hidden-fields-ack";
    function readHidden() {
      try { const value = JSON.parse(localStorage.getItem(hiddenKey) || "[]"); return Array.isArray(value) ? value.filter(id => typeof id === "string") : []; }
      catch { return []; }
    }
    function writeHidden(ids) { if (ids.length) localStorage.setItem(hiddenKey, JSON.stringify(ids)); else localStorage.removeItem(hiddenKey); }
    $("showHiddenFields")?.addEventListener("click", () => $("customizeFields").click());
    window.addEventListener("storage", event => { if (event.key === hiddenKey) page.render(); });
    // Field customization. Changes are made to a draft and only reach case history on Save Configuration.
    let fieldDraft = null, hiddenDraft = null;
    const draftState = () => ({ fieldConfig: fieldDraft, cases: [], archive: [], trash: [], revisions: {} });
    const sameList = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    const draftChanged = () => fieldDraft && (JSON.stringify(fieldDraft) !== JSON.stringify(page.state().fieldConfig) || !sameList(hiddenDraft, readHidden()));
    async function acknowledgeHiding() {
      let seen = false;
      try { seen = localStorage.getItem(hiddenAckKey) === "true"; } catch { /* Ask again. */ }
      if (seen) return true;
      const ok = await window.CaseDialogs.askChoice({
        title: "Before you hide a field",
        message: "These fields are designed around case-notes best practices. By hiding a field, you acknowledge that its information is still needed and that you are choosing to record it a different way. Values already entered are kept, and you can show the field again at any time. This message appears only once.",
        buttons: [{ label: "Cancel", value: false }, { label: "I understand, hide it", value: true, primary: true }]
      });
      if (!ok) return false;
      try { localStorage.setItem(hiddenAckKey, "true"); } catch { /* Asked again next time. */ }
      return true;
    }
    function renderFieldCustomizer() {
      const orderList = $("fieldOrderList");
      orderList.replaceChildren();
      CaseNotes.getEffectiveFields(draftState()).forEach(({ id, label }) => {
        const item = document.createElement("div");
        item.className = "field-order-item";
        item.draggable = true;
        item.dataset.fieldId = id;
        const handle = document.createElement("span"); handle.className = "field-handle"; handle.textContent = "⋮⋮"; handle.setAttribute("aria-hidden", "true");
        const name = document.createElement("span"); name.className = "field-name"; name.textContent = label;
        item.append(handle, name);
        if (CaseNotes.fields[id]) { const builtin = document.createElement("span"); builtin.className = "field-builtin"; builtin.textContent = "✓ Built-in"; item.append(builtin); }
        if (!CaseNotes.unhideableFields.includes(id)) {
          const isHidden = hiddenDraft.has(id);
          item.classList.toggle("field-hidden", isHidden);
          const visibility = document.createElement("button"); visibility.type = "button"; visibility.className = "button secondary field-visibility";
          visibility.textContent = isHidden ? "Show" : "Hide"; visibility.dataset.visibilityFor = id;
          visibility.setAttribute("aria-pressed", String(isHidden)); visibility.setAttribute("aria-label", `${isHidden ? "Show" : "Hide"} ${label}`);
          visibility.addEventListener("click", async () => {
            const hiding = !hiddenDraft.has(id);
            if (hiding && !(await acknowledgeHiding())) { visibility.focus(); return; }
            if (!hiddenDraft) return;
            keepDraftOrder();
            if (hiding) hiddenDraft.add(id); else hiddenDraft.delete(id);
            renderFieldCustomizer();
            $("fieldOrderList").querySelector?.(`[data-visibility-for="${id}"]`)?.focus();
            $("customizerStatus").textContent = `"${label}" will be ${hiding ? "hidden" : "shown"} when you choose Save Configuration.`;
          });
          item.append(visibility);
        }
        item.addEventListener("dragstart", (e) => {
          e.dataTransfer.setData("text/plain", id);
          item.classList.add("dragging");
        });
        item.addEventListener("dragend", () => {
          item.classList.remove("dragging");
        });
        for (const direction of [-1,1]) {
          const move = document.createElement("button"); move.type = "button"; move.className = "button secondary"; move.textContent = direction < 0 ? "↑" : "↓";
          move.setAttribute("aria-label", `Move ${label} ${direction < 0 ? "up" : "down"}`);
          move.addEventListener("click", () => {
            const neighbor = direction < 0 ? item.previousElementSibling : item.nextElementSibling;
            if (neighbor) { orderList.insertBefore(direction < 0 ? item : neighbor,direction < 0 ? neighbor : item); move.focus(); }
          }); item.append(move);
        }
        item.addEventListener("dragover", (e) => {
          e.preventDefault();
          const dragging = orderList.querySelector(".dragging");
          if (dragging && dragging !== item) {
            const rect = item.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (e.clientY < midY) {
              orderList.insertBefore(dragging, item);
            } else {
              orderList.insertBefore(dragging, item.nextSibling);
            }
          }
        });
        orderList.appendChild(item);
      });
      const customList = $("customFieldsList");
      customList.replaceChildren();
      Object.entries(fieldDraft.customFields).forEach(([id, label]) => {
        const item = document.createElement("div");
        item.className = "custom-field-item";
        const idText = document.createElement("span"); idText.className = "field-id"; idText.textContent = id;
        const labelText = document.createElement("span"); labelText.className = "field-label"; labelText.textContent = label;
        const remove = document.createElement("button"); remove.className = "remove-field"; remove.type = "button"; remove.textContent = "Remove";
        remove.setAttribute("aria-label", "Remove " + label);
        remove.addEventListener("click", () => {
          try {
            keepDraftOrder();
            CaseNotes.removeCustomField(draftState(), id);
            renderFieldCustomizer();
            $("customizerStatus").textContent = `"${label}" will be removed when you choose Save Configuration.`;
          } catch (e) {
            $("customizerStatus").textContent = e.message;
          }
        });
        item.append(idText, labelText, remove);
        customList.appendChild(item);
      });
    }
    // Validates and stores a candidate state whose field configuration changed, replacing the current state.
    function writeFieldConfig(candidate) {
      const parsed = CaseNotes.parse(JSON.stringify(candidate));
      localStorage.setItem(key, JSON.stringify(parsed));
      page.replaceState(parsed);
      page.scheduleBackup();
    }
    // Inline layout editing on Case Details. Done saves the new order the same way Save Configuration does.
    const effectiveIds = () => new Set(CaseNotes.getEffectiveFields(page.state()).map(field => field.id));
    window.CaseFieldLayout?.init({
      grid: $("caseDetailsGrid"), toggle: $("layoutToggle"), cancel: $("layoutCancel"), status: $("layoutStatus"),
      canEdit: () => !!page.selected() && page.writable() && !page.copying(),
      fieldId: child => { const input = child.querySelector?.("[id]"); return input && effectiveIds().has(input.id) ? input.id : null; },
      hidden: () => readHidden(),
      canHide: id => !CaseNotes.unhideableFields.includes(id),
      acknowledge: () => acknowledgeHiding(),
      label: id => CaseNotes.getEffectiveFields(page.state()).find(field => field.id === id)?.label || id,
      expand: () => { if ($("caseDetailsSection").classList.contains("collapsed")) $("caseDetailsToggle").click(); },
      save: (gridOrder, hiddenIds) => {
        if (!page.writable() || page.copying()) return false;
        const previousHidden = readHidden();
        try {
          if (!page.save()) return false;
          const candidate = JSON.parse(JSON.stringify(page.state()));
          CaseNotes.reorderFields(candidate, CaseNotes.mergeFieldOrder(candidate.fieldConfig.order, gridOrder));
          writeHidden(hiddenIds);
          writeFieldConfig(candidate);
          page.render();
          return true;
        } catch {
          try { writeHidden(previousHidden); } catch { /* Storage is unavailable; the page still shows the previous layout. */ }
          return false;
        }
      }
    });
    // Keep any reordering made in the list when the draft is redrawn.
    function keepDraftOrder() {
      const order = Array.from($("fieldOrderList").children).map(item => item.dataset.fieldId).filter(Boolean);
      if (order.length) fieldDraft.order = order;
    }
    function closeCustomizer() {
      keepDraftOrder();
      if (draftChanged() && !confirm("Discard your unsaved field changes?")) return;
      fieldDraft = null; hiddenDraft = null;
      $("fieldCustomizer").close();
    }
    $("customizeFields").addEventListener("click", () => {
      if (!page.writable() || page.copying()) return;
      window.SiteTopbar?.closeMenus();
      window.CaseFieldLayout?.discard();
      fieldDraft = JSON.parse(JSON.stringify(page.state().fieldConfig));
      hiddenDraft = new Set(readHidden());
      renderFieldCustomizer();
      if (window.CopyRumble) $("copyRumbleToggle").checked = window.CopyRumble.enabled();
      page.refreshOptions();
      $("fieldCustomizer").showModal();
      $("customizerStatus").textContent = "";
    });
    $("closeCustomizer").addEventListener("click", closeCustomizer);
    $("copyRumbleToggle")?.addEventListener("change", event => {
      const on = event.target.checked;
      if (!window.CopyRumble?.setEnabled(on)) { event.target.checked = !on; $("customizerStatus").textContent = "Could not save the site effect setting. Check browser storage access."; return; }
      page.scheduleBackup();
      $("customizerStatus").textContent = on ? "Copy to Lightning will shake the screen and play a sound." : "Copy to Lightning shake and sound turned off.";
    });
    $("fieldCustomizer").addEventListener("cancel", event => { event.preventDefault?.(); closeCustomizer(); });
    $("addCustomField").addEventListener("click", () => {
      if (!fieldDraft) return;
      const fieldId = $("newFieldId").value.trim();
      const fieldLabel = $("newFieldLabel").value.trim();
      if (!fieldId || !fieldLabel) {
        $("customizerStatus").textContent = "Enter both field ID and label.";
        return;
      }
      try {
        if (document.getElementById(fieldId) && !Object.hasOwn(page.state().fieldConfig.customFields, fieldId)) throw Error("That ID is already used by a page control. Choose another ID.");
        keepDraftOrder();
        CaseNotes.addCustomField(draftState(), fieldId, fieldLabel);
        $("newFieldId").value = "";
        $("newFieldLabel").value = "";
        renderFieldCustomizer();
        $("customizerStatus").textContent = `"${fieldLabel}" will be added when you choose Save Configuration.`;
      } catch (e) {
        $("customizerStatus").textContent = e.message;
      }
    });
    $("saveFieldConfig").addEventListener("click", async () => {
      if (!fieldDraft || !page.writable() || page.copying()) return;
      keepDraftOrder();
      const draft = fieldDraft, hiddenIds = [...hiddenDraft];
      const removed = Object.keys(page.state().fieldConfig.customFields).filter(id => !Object.hasOwn(draft.customFields, id));
      if (removed.length) {
        const names = removed.map(id => `"${page.state().fieldConfig.customFields[id]}"`).join(", ");
        if (!confirm(`Remove ${names} and their values from recent cases, Archive, Trash, and saved versions?`)) return;
        if (!page.save() || !page.writable() || page.copying() || fieldDraft !== draft) return;
        await page.safetyBefore("field-removal");
      }
      try {
        if (!page.save()) throw Error("Could not save your current notes. Retry saving before changing fields.");
        const candidate = JSON.parse(JSON.stringify(page.state()));
        removed.forEach(id => CaseNotes.removeCustomField(candidate, id));
        Object.entries(draft.customFields).forEach(([id, label]) => { if (!Object.hasOwn(candidate.fieldConfig.customFields, id)) CaseNotes.addCustomField(candidate, id, label); });
        CaseNotes.reorderFields(candidate, draft.order);
        writeFieldConfig(candidate);
        const known = new Set(CaseNotes.getEffectiveFields(page.state()).map(field => field.id));
        writeHidden(hiddenIds.filter(id => known.has(id)));
        fieldDraft = null; hiddenDraft = null;
        $("fieldCustomizer").close();
        page.render();
        $("copyStatus").textContent = "Field configuration saved.";
      } catch (e) {
        $("customizerStatus").textContent = e?.message && !/quota|storage/i.test(e.name || "") ? e.message : "Could not save field configuration. Export a backup and check browser storage.";
      }
    });
    $("resetFields").addEventListener("click", async () => {
      if (!page.writable() || page.copying()) return;
      if (confirm(`Reset field order, show every hidden field, and remove custom fields and their values from recent cases, Archive, Trash, and saved versions? This cannot be undone.`)) {
        if (!page.save() || !page.writable() || page.copying()) return;
        await page.safetyBefore("field-reset");
        CaseNotes.resetCustomFields(page.state());
        page.markDirty();
        if (!page.save()) return;
        try { writeHidden([]); } catch { /* The order reset still applies. */ }
        fieldDraft = null; hiddenDraft = null;
        $("fieldCustomizer").close();
        page.render();
        $("copyStatus").textContent = "Fields reset to default.";
      }
    });
    return { readHidden };
  }
  return { init };
})();
