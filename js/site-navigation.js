(() => {
  const key = 'dell-support.pinned-resources.v1';
  const resources = [
    {id:'escalation', title:'DE Escalation Request', description:'Review escalation readiness before the handoff.', href:'escalation-quality.html', category:'ESCALATION READINESS'},
    {id:'case-notes', title:'Case Notes', description:'Capture investigation details and next steps.', href:'case-notes.html', category:'CASE DOCUMENTATION'},
    {id:'troubleshooting', title:'Troubleshooting Guides', description:'Step-by-step guides for Windows Server, Hyper-V, clustering, networking, AD and DNS.', href:'troubleshooting.html', category:'TROUBLESHOOTING'},
    {id:'trends', title:'Support Trends', description:'See evidence gaps and recurring issue patterns.', href:'support-trends.html', category:'CASE QUALITY'},
    {id:'catalog', title:'ISG Tools Catalog', description:'Browse shared ISG support tools and requests.', href:'https://seancrawforddell.github.io/DellSupportoolRepository/#/tools', category:'SUPPORT TOOL CATALOG'},
    {id:'microsoft-tools', title:'Microsoft Support Tools', description:'Open the DellProSupportGse tools repository.', href:'https://github.com/DellProSupportGse/Tools', category:'TOOLS'},
    {id:'knowledge', title:'Knowledge hub', description:'Support guidance and technical references.', href:'knowledge.html', category:'KNOWLEDGE'},
    {id:'ai-resources', title:'AI resources hub', description:'AI-assisted workflows and prompt guidance.', href:'ai-resources.html', category:'AI RESOURCES'},
    {id:'training', title:'Training hub', description:'Onboarding and tool walkthroughs.', href:'training.html', category:'TRAINING'}
  ];
  window.supportResources = resources;
  const getPins = () => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };
  const setPins = pins => { try { localStorage.setItem(key, JSON.stringify(pins)); } catch {} window.dispatchEvent(new Event('pinnedresourceschanged')); };
  const syncButtons = () => document.querySelectorAll('[data-pin-id]').forEach(button => { const pinned = getPins().includes(button.dataset.pinId); button.textContent = pinned ? 'Unpin' : 'Pin to toolkit'; button.setAttribute('aria-pressed', String(pinned)); });
  const initialize = () => {
    const nav = document.querySelector('.primary-nav');
    if (nav && !nav.querySelector('[href="tools.html"]')) nav.insertAdjacentHTML('afterbegin', '<div class="menu-item"><a class="menu-trigger" href="tools.html">Tools <span aria-hidden="true">⌄</span></a><div class="submenu" role="menu"><a href="tools.html" role="menuitem">Tools hub</a><a href="troubleshooting.html" role="menuitem">Troubleshooting Guides</a><a href="https://seancrawforddell.github.io/DellSupportoolRepository/#/tools" target="_blank" rel="noopener noreferrer" role="menuitem">ISG Tools Catalog</a><a href="https://github.com/DellProSupportGse/Tools" target="_blank" rel="noopener noreferrer" role="menuitem">Microsoft Support Tools</a></div></div><div class="menu-item"><a class="menu-trigger" href="case-management.html">Case Management <span aria-hidden="true">⌄</span></a><div class="submenu" role="menu"><a href="case-management.html" role="menuitem">Case Management hub</a><a href="escalation-quality.html" role="menuitem">DE Escalation Request</a><a href="case-notes.html" role="menuitem">Case Notes</a></div></div>');
    const header = document.querySelector('.header');
    if (header && !header.querySelector('#globalSearch')) header.insertAdjacentHTML('beforeend', '<label class="global-search"><span class="visually-hidden">Global search</span><input id="globalSearch" type="search" placeholder="Search resources" autocomplete="off"><div class="global-results" id="globalResults" hidden></div></label>');
    const pageIds = { 'knowledge.html':'knowledge', 'ai-resources.html':'ai-resources', 'training.html':'training' };
    const pageId = pageIds[location.pathname.split('/').pop()];
    if (pageId) document.querySelectorAll('.editable-card').forEach(card => card.insertAdjacentHTML('beforeend', `<button class="pin-button" type="button" data-pin-id="${pageId}">Pin to toolkit</button>`));
    const hubs = { 'tools.html':['troubleshooting', 'catalog', 'microsoft-tools'], 'case-management.html':['escalation', 'case-notes'] };
    const hubResources = hubs[location.pathname.split('/').pop()];
    if (hubResources) {
      const grid = document.querySelector('.editable-grid');
      if (grid) grid.innerHTML = hubResources.map(id => {
        const resource = resources.find(item => item.id === id);
        return `<article class="editable-card"><p class="eyebrow">${resource.category}</p><h2>${resource.title}</h2><p>${resource.description}</p><p><a class="resource-link" href="${resource.href}">Open resource →</a></p><button class="pin-button" type="button" data-pin-id="${resource.id}">Pin to toolkit</button></article>`;
      }).join('');
    }
    document.addEventListener('click', event => { const button = event.target.closest('[data-pin-id]'); if (!button) return; event.preventDefault(); event.stopPropagation(); const pins = getPins(); const id = button.dataset.pinId; setPins(pins.includes(id) ? pins.filter(pin => pin !== id) : [...pins, id]); syncButtons(); });
    document.querySelector('#globalSearch')?.addEventListener('input', event => { const results = document.querySelector('#globalResults'); const term = event.target.value.trim().toLowerCase(); const matches = term ? resources.filter(r => `${r.title} ${r.description} ${r.category}`.toLowerCase().includes(term)).slice(0,6) : []; results.hidden = !matches.length; results.innerHTML = matches.map(r => `<a href="${r.href}"><strong>${r.title}</strong><small>${r.category}</small></a>`).join(''); });
    syncButtons();
    window.dispatchEvent(new Event('pinnedresourceschanged'));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
