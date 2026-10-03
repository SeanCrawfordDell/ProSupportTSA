(() => {
  const key = 'dell-support.toolbox-links.v1';
  const radial = document.getElementById('toolboxRadial');
  const editor = document.getElementById('toolboxEditor');
  const list = document.getElementById('toolboxLinkList');
  const status = document.getElementById('toolboxLinkStatus');
  const toolbox = document.getElementById('floatingToolbox');
  const launcher = document.getElementById('toolboxLauncher');
  let manuallyPlaced = false;
  let positionStart = null;
  function placeBesideHeading() {
    if (manuallyPlaced || toolbox.classList.contains('is-open')) return;
    const heading = document.querySelector('.hero h1');
    if (!heading) return;
    const range = document.createRange();
    range.selectNodeContents(heading);
    const rect = range.getBoundingClientRect();
    toolbox.style.right = 'auto';
    toolbox.style.bottom = 'auto';
    const size = toolbox.offsetWidth;
    toolbox.style.left = `${Math.max(8, Math.min(window.innerWidth - size - 8, rect.right + 18))}px`;
    toolbox.style.top = `${Math.max(8, Math.min(window.innerHeight - size - 8, rect.top + rect.height / 2 - size / 2))}px`;
  }
  launcher.addEventListener('pointerdown', event => {
    positionStart = {x:event.clientX, y:event.clientY};
    launcher.classList.remove('toolbox-wiggle');
  });
  launcher.addEventListener('pointermove', event => {
    if (positionStart && Math.hypot(event.clientX-positionStart.x, event.clientY-positionStart.y) > 5) manuallyPlaced = true;
  });
  launcher.addEventListener('pointerup', () => { positionStart = null; });
  launcher.addEventListener('pointercancel', () => { positionStart = null; });
  launcher.addEventListener('animationend', () => launcher.classList.remove('toolbox-wiggle'));
  window.addEventListener('resize', placeBesideHeading);
  requestAnimationFrame(placeBesideHeading);
  document.fonts?.ready.then(placeBesideHeading);
  setInterval(() => {
    if (!document.hidden && !positionStart && !toolbox.classList.contains('is-open') && !document.querySelector('dialog[open]') && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      launcher.classList.add('toolbox-wiggle');
    }
  }, 10000);
  const preferencesKey = 'dell-support.toolbox-appearance.v1';
  let preferences = {order:[], colors:{}};
  function loadPreferences() {
    preferences = {order:[], colors:{}};
    try { const saved = JSON.parse(localStorage.getItem(preferencesKey)); if (saved && Array.isArray(saved.order) && saved.colors && typeof saved.colors === 'object') preferences = saved; } catch {}
  }
  const launcherSize = () => { const size = Number(preferences.size); return Number.isFinite(size) ? Math.round(Math.max(ToolboxIcons.minSize, Math.min(ToolboxIcons.maxSize, size))) : ToolboxIcons.defaultSize; };
  function applyLauncher() {
    const icon = ToolboxIcons.find(preferences.icon);
    if (launcher.dataset.icon !== icon.id) { launcher.innerHTML = icon.svg; launcher.dataset.icon = icon.id; }
    toolbox.style.setProperty('--toolbox-size', `${launcherSize()}px`);
    toolbox.classList.toggle('toolbox-still', preferences.animate === false);
    if (toolbox.style.left) {
      const size = toolbox.offsetWidth;
      toolbox.style.left = `${Math.max(8, Math.min(window.innerWidth - size - 8, parseFloat(toolbox.style.left)))}px`;
      toolbox.style.top = `${Math.max(8, Math.min(window.innerHeight - size - 8, parseFloat(toolbox.style.top)))}px`;
    }
    placeBesideHeading();
  }
  loadPreferences();
  function savePreferences() {
    try { localStorage.setItem(preferencesKey, JSON.stringify(preferences)); }
    catch { status.textContent = 'Changes apply for this session, but browser storage could not save them.'; }
  }
  const buttonId = button => button.dataset.toolboxAction || button.dataset.shortcutId || 'edit';
  function paint(button, id) {
    const color = preferences.colors[id];
    if (button === launcher) iconSection?.style.setProperty('--lc', /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#b42318');
    if (!/^#[0-9a-f]{6}$/i.test(color || '')) { button.style.background = ''; button.style.color = ''; button.style.removeProperty('--lc'); return; }
    button.style.background = color;
    if (button === launcher) button.style.setProperty('--lc', color);
    const rgb = [1,3,5].map(start => parseInt(color.slice(start,start+2),16) / 255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
    button.style.color = rgb[0]*.2126 + rgb[1]*.7152 + rgb[2]*.0722 > .179 ? '#000000' : '#ffffff';
  }
  function layout() {
    const buttons = [...radial.querySelectorAll('button')];
    buttons.sort((a,b) => {
      const rank = button => { const index = preferences.order.indexOf(buttonId(button)); return index < 0 ? 100 : index; };
      return rank(a) - rank(b);
    });
    buttons.forEach((button,index) => {
      radial.append(button);
      button.style.setProperty('--angle', `${-90 + index * 360 / buttons.length}deg`);
      paint(button,buttonId(button));
    });
    paint(document.getElementById('toolboxLauncher'), 'launcher');
  }
  function reorder(id, targetIndex) {
    const order = [...radial.querySelectorAll('button')].map(buttonId);
    order.splice(order.indexOf(id),1); order.splice(targetIndex,0,id);
    preferences.order = order; savePreferences(); layout(); renderAppearance();
  }
  const appearance = document.createElement('section');
  list.after(appearance);
  const iconSection = document.createElement('fieldset');
  iconSection.id = 'toolboxIconPicker';
  list.after(iconSection);
  const legend = document.createElement('legend'); legend.textContent = 'Launcher icon'; iconSection.append(legend);
  const options = document.createElement('div'); options.className = 'toolbox-icon-options'; iconSection.append(options);
  ToolboxIcons.list.forEach(icon => {
    const label = document.createElement('label'); label.className = 'toolbox-icon-option';
    const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'toolboxIcon'; radio.value = icon.id; radio.setAttribute('aria-label', icon.name);
    radio.addEventListener('change', () => { preferences.icon = icon.id; savePreferences(); applyLauncher(); });
    const swatch = document.createElement('span'); swatch.className = 'toolbox-icon-swatch'; swatch.innerHTML = icon.svg;
    const text = document.createElement('span'); text.textContent = icon.name.replace(/^(Paperclip|Wizard|T-rex): /, '');
    label.append(radio, swatch, text); options.append(label);
  });
  const sizeRow = document.createElement('div'); sizeRow.className = 'toolbox-size-row';
  const sizeLabel = document.createElement('label'); sizeLabel.append('Button size');
  const sizeInput = document.createElement('input'); sizeInput.type = 'range'; sizeInput.min = ToolboxIcons.minSize; sizeInput.max = ToolboxIcons.maxSize; sizeInput.step = 2;
  const sizeOut = document.createElement('output'); sizeInput.setAttribute('aria-label', 'Launcher button size in pixels');
  sizeInput.addEventListener('input', () => { preferences.size = Number(sizeInput.value); sizeOut.textContent = `${sizeInput.value} px`; savePreferences(); applyLauncher(); });
  const sizeReset = document.createElement('button'); sizeReset.type = 'button'; sizeReset.className = 'button secondary'; sizeReset.textContent = 'Reset';
  sizeReset.addEventListener('click', () => { delete preferences.size; savePreferences(); applyLauncher(); syncIconControls(); });
  sizeLabel.append(sizeInput, sizeOut); sizeRow.append(sizeLabel, sizeReset);
  const animateLabel = document.createElement('label'); animateLabel.className = 'toolbox-animate';
  const animateInput = document.createElement('input'); animateInput.type = 'checkbox';
  animateInput.addEventListener('change', () => { preferences.animate = animateInput.checked; savePreferences(); applyLauncher(); });
  animateLabel.append(animateInput, ' Animate the icon');
  iconSection.append(sizeRow, animateLabel);
  function syncIconControls() {
    const current = ToolboxIcons.find(preferences.icon).id;
    options.querySelectorAll('input').forEach(radio => { radio.checked = radio.value === current; });
    sizeInput.value = launcherSize(); sizeOut.textContent = `${launcherSize()} px`;
    animateInput.checked = preferences.animate !== false;
  }
  function renderAppearance() {
    appearance.replaceChildren();
    const help = document.createElement('p'); help.textContent = 'Drag action circles around the toolbox to reorder them, or use the arrows below. Choose a color for each circle.'; appearance.append(help);
    [document.getElementById('toolboxLauncher'), ...radial.querySelectorAll('button')].forEach((button,index) => {
      const id = index === 0 ? 'launcher' : buttonId(button);
      const name = index === 0 ? 'Toolbox icon' : button.textContent;
      const row = document.createElement('div'); row.className = 'toolbox-color-row';
      const label = document.createElement('label'); label.textContent = name;
      const color = document.createElement('input'); color.type='color'; color.value = preferences.colors[id] || (id === 'launcher' ? '#b42318' : '#164156'); color.setAttribute('aria-label', `${name} color`);
      color.addEventListener('input', () => { preferences.colors[id]=color.value; paint(button,id); savePreferences(); });
      label.append(color); row.append(label);
      if(index > 0) [-1,1].forEach(direction => {
        const move = document.createElement('button'); move.type='button'; move.textContent=direction < 0 ? '←' : '→'; move.setAttribute('aria-label', `Move ${name} ${direction < 0 ? 'earlier' : 'later'}`);
        move.disabled = index-1+direction < 0 || index-1+direction >= radial.children.length;
        move.addEventListener('click', () => reorder(id,index-1+direction)); row.append(move);
      });
      appearance.append(row);
    });
  }
  let drag = null, suppressClick = false;
  radial.addEventListener('pointerdown', event => {
    const button=event.target.closest('button'); if(!button || event.button !== 0) return;
    drag={button,x:event.clientX,y:event.clientY,moved:false}; button.setPointerCapture(event.pointerId);
  });
  radial.addEventListener('pointermove', event => {
    if(!drag || Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<8) return;
    drag.moved=true;
    const rect=document.getElementById('toolboxLauncher').getBoundingClientRect();
    const angle=(Math.atan2(event.clientY-rect.top-rect.height/2,event.clientX-rect.left-rect.width/2)*180/Math.PI+450)%360;
    const target=Math.round(angle/(360/radial.children.length))%radial.children.length;
    const current=[...radial.children].indexOf(drag.button);
    if(target!==current) reorder(buttonId(drag.button),target);
  });
  radial.addEventListener('pointerup', () => { suppressClick=!!drag?.moved; drag=null; });
  radial.addEventListener('pointercancel', () => { drag=null; suppressClick=false; });
  radial.addEventListener('click', event => { if(suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick=false; } },true);
  const safeUrl = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; } };
  let links = [];
  function loadLinks() {
    links = [];
    try { const saved = JSON.parse(localStorage.getItem(key) || '[]'); if (Array.isArray(saved)) links = saved.filter(link => typeof link.name === 'string' && safeUrl(link.url)).slice(0, 4); } catch {}
  }
  loadLinks();
  function save(next) {
    try { localStorage.setItem(key, JSON.stringify(next)); links = next; render(); return true; }
    catch { status.textContent = 'Could not save shortcuts. Check browser storage access and try again.'; return false; }
  }
  function closeMenu() {
    document.getElementById('floatingToolbox').classList.remove('is-open');
    toolbox.style.removeProperty('--orbit');
    radial.inert = true;
    const launcher = document.getElementById('toolboxLauncher');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-label', 'Open case notes toolbox');
  }
  const edit = document.createElement('button');
  edit.type = 'button'; edit.textContent = 'Edit toolbox'; radial.append(edit);
  edit.addEventListener('click', () => { closeMenu(); status.textContent = ''; editor.showModal(); });
  function render() {
    radial.querySelectorAll('[data-custom-shortcut]').forEach(button => button.remove());
    list.replaceChildren();
    links.forEach((link, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.customShortcut = 'true'; button.textContent = link.name;
      button.dataset.shortcutId = `url:${link.url}:${link.name}`;
      button.title = `${link.url} (opens in a new tab)`;
      button.addEventListener('click', () => { window.open(safeUrl(link.url), '_blank', 'noopener,noreferrer'); closeMenu(); });
      radial.append(button);
      const row = document.createElement('li');
      const text = document.createElement('span'); text.textContent = `${link.name} — ${link.url}`;
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'button secondary'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${link.name}`);
      remove.addEventListener('click', () => { if (save(links.filter((_, i) => i !== index))) status.textContent = 'Shortcut removed.'; });
      row.append(text, remove); list.append(row);
    });
    layout(); renderAppearance(); applyLauncher(); syncIconControls();
  }
  document.getElementById('toolboxLinkForm').addEventListener('submit', event => {
    event.preventDefault();
    const name = document.getElementById('toolboxLinkName').value.trim();
    const url = safeUrl(document.getElementById('toolboxLinkUrl').value.trim());
    if (!name || !url) { status.textContent = 'Enter a name and a valid HTTP or HTTPS URL without login credentials.'; return; }
    if (links.length >= 4) { status.textContent = 'Remove a shortcut before adding another (maximum four).'; return; }
    if (save([...links, {name, url}])) { event.target.reset(); status.textContent = 'Shortcut saved.'; }
  });
  document.getElementById('closeToolboxEditor').addEventListener('click', () => editor.close());
  editor.addEventListener('close', () => document.getElementById('toolboxLauncher').focus());
  window.addEventListener('prosSupportToolboxRestore', () => { loadPreferences(); loadLinks(); render(); });
  render();
})();
