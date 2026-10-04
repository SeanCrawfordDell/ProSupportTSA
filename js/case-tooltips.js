function installCaseTooltips(document, window) {
  const selector = 'button, [role="button"]';
  let active = null, tooltip = null, timer = null, dismissTimer = null;
  function convert(button) {
    const title = button.getAttribute('title');
    if (title !== null) {
      button.setAttribute('data-tooltip', title);
      button.removeAttribute('title');
    }
  }
  function scan(root) {
    if (root.matches?.(selector)) convert(root);
    root.querySelectorAll?.(selector).forEach(convert);
  }
  function hide() {
    window.clearTimeout(timer); window.clearTimeout(dismissTimer);
    if (active) {
      const ids = (active.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== 'case-fast-tooltip');
      if (ids.length) active.setAttribute('aria-describedby', ids.join(' '));
      else active.removeAttribute('aria-describedby');
    }
    if (tooltip) tooltip.hidden = true;
    active = null;
  }
  function show(button) {
    if (active !== button || !button.isConnected) return;
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.setAttribute('id', 'case-fast-tooltip');
      tooltip.setAttribute('role', 'tooltip');
      tooltip.className = 'case-fast-tooltip';
    }
    // A modal's top layer would obscure a tooltip attached to the page body.
    (button.closest('dialog[open]') || document.body).append(tooltip);
    tooltip.textContent = button.getAttribute('data-tooltip');
    tooltip.hidden = false;
    const ids = new Set((button.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    ids.add('case-fast-tooltip'); button.setAttribute('aria-describedby', [...ids].join(' '));
    const rect = button.getBoundingClientRect();
    const box = tooltip.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left + (rect.width - box.width) / 2, window.innerWidth - box.width - 8));
    const preferredTop = rect.top >= box.height + 16 ? rect.top - box.height - 8 : rect.bottom + 8;
    tooltip.style.left = left + 'px';
    tooltip.style.top = Math.max(8, Math.min(preferredTop, window.innerHeight - box.height - 8)) + 'px';
  }
  function start(button, delay) {
    convert(button);
    if (!button.getAttribute('data-tooltip')) return;
    if (active === button) { window.clearTimeout(dismissTimer); return; }
    hide(); active = button;
    if (delay) timer = window.setTimeout(() => show(button), delay);
    else show(button);
  }
  document.addEventListener('pointerover', event => {
    if (event.pointerType === 'touch') return;
    if (tooltip?.contains(event.target)) { window.clearTimeout(dismissTimer); return; }
    const button = event.target.closest?.(selector);
    if (button) start(button, 200);
  });
  document.addEventListener('pointerout', event => {
    if (!active) return;
    if (event.relatedTarget && (active.contains(event.relatedTarget) || tooltip?.contains(event.relatedTarget))) return;
    window.clearTimeout(timer);
    dismissTimer = window.setTimeout(hide, 100);
  });
  document.addEventListener('focusin', event => {
    const button = event.target.closest?.(selector);
    if (button?.matches(':focus-visible')) { hide(); start(button, 0); }
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  window.addEventListener('blur', hide);
  scan(document);
  if (window.MutationObserver) new window.MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') convert(record.target);
      else record.addedNodes.forEach(scan);
    }
    if (active && (!active.isConnected || (active.getClientRects && !active.getClientRects().length))) hide();
  }).observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['title']});
}
if (typeof module !== 'undefined') module.exports = installCaseTooltips;
else installCaseTooltips(document, window);
