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
    const header = document.querySelector('.header');
    if (header && !header.querySelector('#globalSearch')) header.insertAdjacentHTML('beforeend', '<div class="global-search" role="search"><label><span class="visually-hidden">Search resources</span><input id="globalSearch" type="search" placeholder="Search resources" autocomplete="off" aria-controls="globalResults"></label><div class="global-results" id="globalResults" hidden></div><p class="visually-hidden" id="globalStatus" role="status"></p></div>');
    const pageIds = { 'knowledge.html':'knowledge', 'ai-resources.html':'ai-resources', 'training.html':'training' };
    const pageId = pageIds[location.pathname.split('/').pop()];
    // One pin button per hub page, in the hero: every card on these pages pins the same page.
    if (pageId) document.querySelector('.resource-hero')?.insertAdjacentHTML('beforeend', `<button class="pin-button" type="button" data-pin-id="${pageId}">Pin to toolkit</button>`);
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
    const search = document.querySelector('#globalSearch'), results = document.querySelector('#globalResults'), status = document.querySelector('#globalStatus');
    const closeResults = () => { if (results) results.hidden = true; };
    search?.addEventListener('input', () => {
      const term = search.value.trim().toLowerCase();
      const matches = term ? resources.filter(r => `${r.title} ${r.description} ${r.category}`.toLowerCase().includes(term)).slice(0,6) : [];
      results.replaceChildren(...matches.map(r => {
        const link = document.createElement('a'), title = document.createElement('strong'), category = document.createElement('small');
        link.href = r.href; title.textContent = r.title; category.textContent = r.category;
        if (/^https?:/.test(r.href)) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
        link.append(title, category); return link;
      }));
      if (term && !matches.length) { const empty = document.createElement('p'); empty.className = 'global-empty'; empty.textContent = 'No matching resources.'; results.append(empty); }
      results.hidden = !term;
      status.textContent = term ? `${matches.length} result${matches.length === 1 ? '' : 's'}` : '';
    });
    search?.addEventListener('keydown', event => { if (event.key === 'Escape') { closeResults(); search.blur(); } });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && results && !results.hidden) { closeResults(); search.focus(); } });
    document.addEventListener('click', event => { if (!event.target.closest('.global-search')) closeResults(); });
    syncButtons();
    window.dispatchEvent(new Event('pinnedresourceschanged'));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
