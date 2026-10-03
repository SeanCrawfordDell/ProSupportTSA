"use strict";
window.CaseMarkdown = (() => {
  let api;
  const resizeHandles = new Map();
  const fields = ["notes", "next"];
  const $ = id => document.getElementById(id);
  const raster = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
  function sanitize(html) {
    const safe = DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true }, FORBID_TAGS: ["style", "input", "form", "button", "video", "audio"], FORBID_ATTR: ["style", "id", "name"], RETURN_DOM_FRAGMENT: true
    });
    safe.querySelectorAll("img").forEach(img => { if (!raster.test(img.getAttribute("src") || "")) img.replaceWith(document.createTextNode(`[Image: ${img.alt || "external image"}]`)); });
    safe.querySelectorAll("a").forEach(link => { link.target = "_blank"; link.rel = "noopener noreferrer"; });
    return safe;
  }
  function renderedMarkdown(text, note) {
    const source = text.replace(/!\[([^\]]*)\]\(attachment:([a-zA-Z0-9-]+)\)/g, (_, label, id) => {
      const data = note.images?.[id]?.data;
      return data && raster.test(data) ? `![${label}](${data})` : `[Missing screenshot: ${label}]`;
    }).replace(/src="attachment:([a-zA-Z0-9-]+)"/g, (_, id) => {
      const data = note.images?.[id]?.data;
      return `src="${data && raster.test(data) ? data : ""}"`;
    });
    return sanitize(marked.parse(source, { gfm: true, breaks: true }));
  }
  function serialize(field) {
    const note = api.current(), container = document.createElement("div");
    container.append(sanitize($(field + "Rich").innerHTML));
    container.querySelectorAll("img").forEach(img => {
      const pair = Object.entries(note.images || {}).find(([, image]) => image.data === img.getAttribute("src"));
      if (pair) img.setAttribute("src", "attachment:" + pair[0]);
      else img.replaceWith(document.createTextNode("[Screenshot not saved]"));
    });
    return container.textContent.trim() || container.querySelector("img") ? container.innerHTML : "";
  }
  function saveEditor(field) {
    if (!api.canEdit() || !api.current()) return;
    api.update(field, serialize(field));
   
  }
  function positionHandle(field) {
    const active = resizeHandles.get(field);
    if (!active) return;
    if (!active.image.isConnected || !api.canEdit()) { active.handle.hidden = true; return; }
    const rect = active.image.getBoundingClientRect();
    const parent = active.handle.parentElement.getBoundingClientRect();
    const editor = $(field + "Rich").getBoundingClientRect();
    active.handle.hidden = rect.bottom < editor.top || rect.bottom > editor.bottom || rect.right > editor.right;
    active.handle.style.left = `${rect.right - parent.left - 9}px`;
    active.handle.style.top = `${rect.bottom - parent.top - 9}px`;
  }
  function attachResize(field, image) {
    const old = resizeHandles.get(field); old?.handle.remove();
    if (!api.canEdit()) return;
    const handle = document.createElement("button"); handle.type = "button";
    handle.className = "image-resize-handle";
    handle.setAttribute("aria-label", "Resize screenshot: drag corner or use arrow keys");
    handle.title = "Drag to resize · Arrow keys resize by 20 pixels";
    $(field + "Rich").parentElement.append(handle);
    const active = { image, handle }; resizeHandles.set(field, active); positionHandle(field);
    function applyWidth(width) {
      const max = $(field + "Rich").clientWidth - 28;
      image.setAttribute("width", String(Math.round(Math.max(60, Math.min(width, max)))));
      image.removeAttribute("height"); positionHandle(field);
    }
    handle.addEventListener("pointerdown", event => {
      if (!api.canEdit()) return;
      event.preventDefault();
      const caseId = api.current().id, entryId = api.current().activeEntryId;
      const rect = image.getBoundingClientRect();
      const startX = event.clientX, startY = event.clientY;
      const ratio = rect.width / Math.max(1, rect.height);
      handle.setPointerCapture(event.pointerId);
      function move(e) {
        if (!api.canEdit() || (api.current()?.id !== caseId || api.current()?.activeEntryId !== entryId)) return;
        const dx = e.clientX - startX, dy = (e.clientY - startY) * ratio;
        applyWidth(rect.width + (Math.abs(dx) >= Math.abs(dy) ? dx : dy));
      }
      function end() {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
        if (api.canEdit() && api.current()?.id === caseId && api.current()?.activeEntryId === entryId && image.isConnected) {
          api.update(field, serialize(field), { ...api.current().images });
        }
      }
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
    });
    handle.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) || !api.canEdit()) return;
      event.preventDefault();
      applyWidth(image.getBoundingClientRect().width + (["ArrowRight", "ArrowDown"].includes(event.key) ? 20 : -20));
      api.update(field, serialize(field), { ...api.current().images });
    });
  }
  function emailHtml(note, now, fieldConfig = null, inlineImages = false) {
    const body = document.createElement("div");
    const images = {};
    const exportFields = fieldConfig ? CaseNotes.getEffectiveFields({fieldConfig}).map(({id,label}) => [id,label]) : Object.entries(CaseNotes.fields);
    exportFields.forEach(([field, label]) => {
      const heading = document.createElement("h2"); heading.textContent = label;
      heading.setAttribute("style", "font-size:16px;margin:24px 0 8px;color:#163247");
      body.append(heading);
      if (fields.includes(field)) {
        const content = renderedMarkdown(CaseNotes.exportField(note,field), note);
        content.querySelectorAll("img").forEach(img => {
          const pair = Object.entries(note.images || {}).find(([, image]) => image.data === img.getAttribute("src"));
          if (!pair) { img.replaceWith(document.createTextNode("[Screenshot]")); return; }
          const [id, image] = pair; images[id] = image;
          img.setAttribute("src", inlineImages ? image.data : `cid:${id}@case-notes`);
          img.setAttribute("style", "max-width:100%;height:auto;display:block;margin:12px 0");
        });
        body.append(content);
      } else {
        const paragraph = document.createElement("p"); paragraph.textContent = note[field];
        paragraph.setAttribute("style", "white-space:pre-wrap;margin:0 0 12px"); body.append(paragraph);
      }
    });
    const extra = CaseToolkitCore.extraText(note);
    if (extra) {
      const additional = document.createElement("p"); additional.textContent = extra;
      additional.setAttribute("style", "white-space:pre-wrap"); body.append(additional);
    }
    const time = document.createElement("p");
    time.textContent = "Time Spent: " + CaseNotes.duration(CaseNotes.elapsed(note, now)); body.append(time);
    return { html: '<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#163247;background:#ffffff;padding:24px">' + body.innerHTML + '</body></html>', images };
  }
  async function encode(file) {
    if (file.size > 20 * 1024 * 1024) throw Error("Screenshot is too large. Paste an image smaller than 20 MB.");
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");ctx.fillStyle = "white";ctx.fillRect(0, 0, canvas.width, canvas.height);ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      let data = canvas.toDataURL("image/png");
      if (data.length > 600000) data = canvas.toDataURL("image/jpeg", .82);
      if (data.length > 1000000) throw Error("Screenshot is too detailed to store. Crop the image and paste it again.");
      return data;
    } finally { bitmap.close(); }
  }
  function insert(field, html) {
    $(field + "Rich").focus();
    document.execCommand("insertHTML", false, html);
    saveEditor(field);
  }
  function init(options) {
    api = options;
    window.addEventListener("resize", () => fields.forEach(positionHandle));
    fields.forEach(field => {
      const editor = $(field + "Rich");
      editor.addEventListener("click", event => {
        if (event.target.tagName === "IMG") attachResize(field, event.target);
        else { resizeHandles.get(field)?.handle.remove(); resizeHandles.delete(field); }
      });
      editor.addEventListener("scroll", () => positionHandle(field));
      $(field + "Toolbar").querySelectorAll("button").forEach(button => {
        button.addEventListener("mousedown", event => event.preventDefault());
        button.addEventListener("click", () => {
          if (!api.canEdit()) return;
          const command = button.dataset.command;
          let value = null;
          if (command === "createLink") {
            value = prompt("Enter the link URL (https://…)");
            if (!value) return;
            try { const url = new URL(value); if (!["https:", "http:", "mailto:"].includes(url.protocol)) throw Error(); }
            catch { $(field + "ImageStatus").textContent = "Use an http, https, or mailto link."; return; }
          }
          editor.focus(); document.execCommand(command, false, value); saveEditor(field);
        });
      });
      editor.addEventListener("input", () => saveEditor(field));
      editor.addEventListener("drop", event => { event.preventDefault(); $(field + "ImageStatus").textContent = "Paste screenshots with Ctrl+V / ⌘V."; });
      editor.addEventListener("paste", async event => {
        event.preventDefault();
        if (!api.canEdit() || !api.current()) return;
        const files = Array.from(event.clipboardData?.items || []).filter(item => item.type.startsWith("image/")).map(item => item.getAsFile()).filter(Boolean);
        if (!files.length) {
          const html = event.clipboardData?.getData("text/html");
          const container = document.createElement("div");
          if (html) container.append(sanitize(html));
          else container.textContent = event.clipboardData?.getData("text/plain") || "";
          insert(field, container.innerHTML.replace(/\n/g, "<br>")); return;
        }
        const caseId = api.current().id, entryId = api.current().activeEntryId;
        const selection = window.getSelection();
        const range = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
        $(field + "ImageStatus").textContent = "Adding screenshot…";
        try {
          for (const file of files) {
            const data = await encode(file);
            if (!api.canEdit() || (api.current()?.id !== caseId || api.current()?.activeEntryId !== entryId)) throw Error("The case or dated note changed. Paste the screenshot again in the intended note.");
            const note = api.current(), id = crypto.randomUUID(), name = "Screenshot " + new Date().toLocaleTimeString();
            const images = { ...note.images, [id]: { name, data } };
            // Register the image before serialization converts its URL to a stored reference.
            api.update(field, note[field], images);
            if (range && editor.contains(range.commonAncestorContainer)) { selection.removeAllRanges(); selection.addRange(range); }
            const img = document.createElement("img"); img.src = data; img.alt = name;
            insert(field, img.outerHTML + "<p><br></p>");
            api.update(field, serialize(field), images);
          }
          $(field + "ImageStatus").textContent = "Screenshot added. Backups and HTML emails include images; Copy to Lightning stays plain text. Check the save status above.";
        } catch (error) { $(field + "ImageStatus").textContent = error.message || "Could not read the screenshot. Try PNG or JPEG."; }
      });
    });
  }
  function setEditable(editable) {
    fields.forEach(field => {
      if (!editable) { resizeHandles.get(field)?.handle.remove(); resizeHandles.delete(field); }
      $(field + "Rich").contentEditable = String(editable);
      $(field + "Rich").setAttribute("aria-readonly", String(!editable));
      $(field + "Toolbar").querySelectorAll("button").forEach(button => { button.disabled = !editable; });
    });
  }
  return { init, emailHtml, setEditable, renderContent: renderedMarkdown, refresh() {
    if (!api || !api.current()) return;
    fields.forEach(field => {
      resizeHandles.get(field)?.handle.remove(); resizeHandles.delete(field);
      $(field + "Rich").replaceChildren(renderedMarkdown(api.current()[field], api.current()));
      $(field + "ImageStatus").textContent = "";
    });
  } };
})();
