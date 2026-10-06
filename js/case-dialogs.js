"use strict";
// Shared confirmation dialog for Case Notes (the #backupConfirmDialog markup lives in case-notes.html).
window.CaseDialogs = (() => {
  const $ = id => document.getElementById(id);
  // ---- confirmation dialog: buttons are [{label, value, primary}]; Escape resolves null
  function askChoice({ title, message, buttons, typeToConfirm = null }) {
    const dialog = $("backupConfirmDialog");
    return new Promise(resolve => {
      $("backupConfirmTitle").textContent = title;
      $("backupConfirmMessage").textContent = message;
      const input = $("backupConfirmInput"), typeRow = $("backupConfirmTypeLabel"), actions = $("backupConfirmButtons");
      typeRow.hidden = !typeToConfirm; input.value = "";
      if (typeToConfirm) $("backupConfirmWord").textContent = typeToConfirm;
      actions.textContent = "";
      const guarded = [];
      let done = false;
      const finish = value => { if (done) return; done = true; dialog.removeEventListener("close", onClose); if (dialog.open) dialog.close(); resolve(value); };
      const onClose = () => finish(null);
      for (const choice of buttons) {
        const button = document.createElement("button");
        button.type = "button"; button.className = `button ${choice.primary ? "primary" : "secondary"}`; button.textContent = choice.label;
        if (typeToConfirm && choice.value) { button.disabled = true; guarded.push(button); }
        button.addEventListener("click", () => finish(choice.value));
        actions.append(button);
      }
      input.oninput = () => guarded.forEach(button => { button.disabled = input.value.trim().toUpperCase() !== typeToConfirm; });
      dialog.addEventListener("close", onClose);
      dialog.showModal();
      (typeToConfirm ? input : actions.querySelector(".primary") || actions.firstChild)?.focus();
    });
  }
  return { askChoice };
})();
