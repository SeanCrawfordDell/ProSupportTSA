(() => {
  const grid = document.querySelector('#toolGrid');
  const search = document.querySelector('#toolSearch');
  const count = document.querySelector('#toolCount');
  const noResults = document.querySelector('#noResults');
  const gridButton = document.querySelector('#gridView');
  const listButton = document.querySelector('#listView');

  if (!grid || !search || !count || !noResults || !gridButton || !listButton) return;

  const cards = [...grid.querySelectorAll('.tool-card')];

  const updateResults = () => {
    const term = search.value.trim().toLowerCase();
    let visible = 0;
    cards.forEach((card) => {
      const matches = !term || card.textContent.toLowerCase().includes(term);
      card.hidden = !matches;
      if (matches) visible += 1;
    });
    count.textContent = `${visible} tool${visible === 1 ? '' : 's'} available`;
    noResults.hidden = visible !== 0;
  };

  const setView = (view) => {
    const isList = view === 'list';
    grid.classList.toggle('list-view', isList);
    gridButton.classList.toggle('is-selected', !isList);
    listButton.classList.toggle('is-selected', isList);
    gridButton.setAttribute('aria-pressed', String(!isList));
    listButton.setAttribute('aria-pressed', String(isList));
  };

  search.addEventListener('input', updateResults);
  gridButton.addEventListener('click', () => setView('grid'));
  listButton.addEventListener('click', () => setView('list'));
  const renderPins = () => {
    const section = document.querySelector('#pinnedTools');
    const pinnedGrid = document.querySelector('#pinnedGrid');
    const resources = window.supportResources || [];
    let pins = [];
    try { pins = JSON.parse(localStorage.getItem('dell-support.pinned-resources.v1') || '[]'); } catch {}
    const selected = resources.filter(resource => pins.includes(resource.id));
    section.hidden = !selected.length;
    // Same structure as the catalog cards: a stretched heading link, so the card is one clean link for screen readers.
    pinnedGrid.replaceChildren(...selected.map(resource => {
      const card = document.createElement('article'), category = document.createElement('p'), heading = document.createElement('h3');
      const link = document.createElement('a'), description = document.createElement('p'), action = document.createElement('div');
      card.className = 'tool-card active'; category.className = 'category'; category.textContent = resource.category;
      link.className = 'card-link'; link.href = resource.href; link.textContent = resource.title;
      if (/^https?:/.test(resource.href)) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
      heading.append(link); description.textContent = resource.description;
      action.className = 'card-action'; action.textContent = 'Open resource ↗';
      card.append(category, heading, description, action);
      return card;
    }));
  };
  window.addEventListener('pinnedresourceschanged', renderPins);
  setTimeout(renderPins, 0);
})();
