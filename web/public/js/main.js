const root = document.documentElement;
const themeButton = document.querySelector('[data-theme-toggle]');
const menuButton = document.querySelector('[data-menu-toggle]');
const nav = document.querySelector('[data-site-nav]');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function setTheme(theme, persist = true) {
  const next = theme === 'light' ? 'light' : 'dark';
  root.dataset.theme = next;
  if (persist) {
    try { localStorage.setItem('djousse-theme', next); } catch { /* stockage indisponible */ }
  }
  if (themeButton) {
    themeButton.setAttribute('aria-label', next === 'dark' ? 'Activer le thème clair' : 'Activer le thème sombre');
    themeButton.setAttribute('title', next === 'dark' ? 'Thème clair' : 'Thème sombre');
    const icon = themeButton.querySelector('[data-theme-icon]');
    if (icon) icon.textContent = next === 'dark' ? '☼' : '◐';
  }
}

setTheme(root.dataset.theme || 'dark', false);
themeButton?.addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));

function closeMenu() {
  if (!menuButton || !nav) return;
  nav.dataset.open = 'false';
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Ouvrir le menu');
}

menuButton?.addEventListener('click', () => {
  const open = nav.dataset.open !== 'true';
  nav.dataset.open = String(open);
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
});
nav?.addEventListener('click', (event) => { if (event.target.closest('a')) closeMenu(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });

const currentFile = location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('[data-site-nav] a[href]').forEach((link) => {
  const targetFile = new URL(link.href, location.href).pathname.split('/').pop() || 'index.html';
  if (targetFile === currentFile || (currentFile === 'index.html' && targetFile === '')) link.setAttribute('aria-current', 'page');
});

async function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const helper = document.createElement('textarea');
  helper.value = value;
  helper.setAttribute('readonly', '');
  helper.style.position = 'fixed';
  helper.style.opacity = '0';
  document.body.append(helper);
  helper.select();
  const success = document.execCommand('copy');
  helper.remove();
  if (!success) throw new Error('Copie non disponible');
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-copy-target], [data-copy-text]');
  if (!button) return;
  const target = button.dataset.copyTarget ? document.getElementById(button.dataset.copyTarget) : null;
  const text = button.dataset.copyText ?? target?.textContent?.trim();
  if (!text) return;
  const previous = button.textContent;
  try {
    await copyText(text);
    button.textContent = 'Copié';
    button.setAttribute('aria-live', 'polite');
  } catch { button.textContent = 'Copie impossible'; }
  window.setTimeout(() => { button.textContent = previous; }, 1800);
});

const installSearch = document.querySelector('[data-install-search]');
installSearch?.addEventListener('input', () => {
  const query = installSearch.value.trim().toLocaleLowerCase('fr');
  document.querySelectorAll('[data-search-section]').forEach((section) => {
    const text = section.textContent.toLocaleLowerCase('fr');
    section.hidden = Boolean(query) && !text.includes(query);
  });
});

function appendPillars(container, pillars) {
  const fragment = document.createDocumentFragment();
  pillars.forEach((pillar, index) => {
    const article = document.createElement('article');
    article.className = 'card pillar-card';
    const number = document.createElement('span');
    number.className = 'pillar-index';
    number.textContent = `${String(index + 1).padStart(2, '0')} / ${pillar.title.toLocaleUpperCase('fr')}`;
    const title = document.createElement('h3');
    title.textContent = pillar.title;
    const text = document.createElement('p');
    text.textContent = pillar.text;
    article.append(number, title, text);
    fragment.append(article);
  });
  container.replaceChildren(fragment);
}

function appendSimpleList(container, rows, renderRow) {
  const fragment = document.createDocumentFragment();
  rows.forEach((row) => fragment.append(renderRow(row)));
  container.replaceChildren(fragment);
}

async function populateSiteData() {
  try {
    const response = await fetch('./data/site-data.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Données indisponibles');
    const data = await response.json();
    window.djousseSiteData = data;

    document.querySelectorAll('[data-stat]').forEach((element) => {
      const value = element.dataset.stat.split('.').reduce((current, key) => current?.[key], data);
      if (value !== undefined) element.textContent = String(value);
    });
    document.querySelectorAll('[data-site-name]').forEach((element) => { element.textContent = data.name; });
    document.querySelectorAll('[data-site-tagline]').forEach((element) => { element.textContent = data.tagline; });
    document.querySelectorAll('[data-site-pitch]').forEach((element) => { element.textContent = data.pitch; });
    document.querySelectorAll('[data-attribution]').forEach((element) => { element.textContent = data.attribution; });
    document.querySelectorAll('[data-link]').forEach((element) => {
      const value = data.links?.[element.dataset.link];
      if (value) element.href = value;
    });

    const categoryGrid = document.querySelector('[data-category-grid]');
    if (categoryGrid) {
      const fragment = document.createDocumentFragment();
      for (const category of data.categories || []) {
        const link = document.createElement('a');
        link.className = 'category-link';
        link.href = `./commandes.html?cat=${encodeURIComponent(category.n)}`;
        const number = document.createElement('span');
        number.className = 'category-number';
        number.textContent = String(category.n).padStart(2, '0');
        const text = document.createElement('span');
        const name = document.createElement('span');
        name.className = 'category-name';
        name.textContent = `${category.icon} ${category.name}`;
        const count = document.createElement('span');
        count.className = 'category-count';
        count.textContent = `${category.count} commandes`;
        text.append(name, count);
        link.append(number, text);
        fragment.append(link);
      }
      categoryGrid.replaceChildren(fragment);
    }

    const guardList = document.querySelector('[data-guard-list]');
    if (guardList) appendSimpleList(guardList, data.guard || [], (protection) => {
      const item = document.createElement('li');
      item.className = 'protection-item';
      const content = document.createElement('div');
      const name = document.createElement('code');
      name.textContent = protection.id;
      const effect = document.createElement('p');
      effect.textContent = protection.effect;
      content.append(name, effect);
      item.append(content);
      return item;
    });

    const mockMenu = document.querySelector('[data-mock-menu]');
    if (mockMenu) {
      const fragment = document.createDocumentFragment();
      for (const category of data.categories || []) {
        const line = document.createElement('span');
        line.textContent = `${category.n}  ${category.name}`;
        fragment.append(line, document.createElement('br'));
      }
      mockMenu.replaceChildren(fragment);
    }

    const pillarGrid = document.querySelector('[data-pillar-grid]');
    if (pillarGrid) appendPillars(pillarGrid, data.features?.pillars || []);

    const aiList = document.querySelector('[data-ai-list]');
    if (aiList) appendSimpleList(aiList, data.features?.ai || [], (item) => {
      const li = document.createElement('li');
      const command = document.createElement('code');
      command.textContent = item.command;
      li.append(command, document.createTextNode(` — ${item.text}`));
      return li;
    });

    const mediaList = document.querySelector('[data-media-list]');
    if (mediaList) appendSimpleList(mediaList, data.features?.media || [], (item) => {
      const li = document.createElement('li');
      li.textContent = item;
      return li;
    });

    const modesTable = document.querySelector('[data-modes-table]');
    if (modesTable) appendSimpleList(modesTable, data.modes || [], (mode) => {
      const row = document.createElement('tr');
      const name = document.createElement('th');
      name.scope = 'row';
      name.textContent = mode.name;
      const scope = document.createElement('td');
      scope.textContent = mode.scope;
      const risk = document.createElement('td');
      risk.textContent = mode.risk;
      row.append(name, scope, risk);
      return row;
    });
  } catch {
    document.querySelectorAll('[data-data-warning]').forEach((element) => { element.hidden = false; });
  }
}

let revealObserver;
function getRevealObserver() {
  if (reducedMotion || !('IntersectionObserver' in window)) return null;
  if (revealObserver) return revealObserver;
  revealObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    }
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  return revealObserver;
}

function observeReveal(elements) {
  const obs = getRevealObserver();
  if (!obs) {
    elements.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  elements.forEach((el) => {
    if (el.classList.contains('is-visible') || el.dataset.revealReady === '1') return;
    el.dataset.revealReady = '1';
    obs.observe(el);
  });
}

function applyAutoReveal() {
  const groups = [
    { sel: '.hero .stat-ribbon, .stat-ribbon, .section-heading, .page-hero, .prose > section, .prose > h2, .prose > h3, .toc, .panel, .callout, .table-wrap, .pair-grid > *, .cookie-banner', variant: '' },
    { sel: '.card, .category-link, .command-card, .stat-item, .protection-item, .faq-list details, .step, .steps li, .mode-table tr, .data-table tbody tr, .footer-grid', variant: '' }
  ];
  const targets = new Set();
  for (const { sel, variant } of groups) {
    document.querySelectorAll(sel).forEach((el) => {
      if (el.closest('.hero-copy') || el.closest('.chat-window') || el.closest('.site-header') || el.closest('.cookie-prefs')) return;
      if (!el.classList.contains('reveal')) {
        el.classList.add('reveal');
        if (variant) el.classList.add(variant);
      }
      targets.add(el);
    });
  }
  // Stagger enfants dans grilles/listes
  document.querySelectorAll('.card-grid, .category-grid, .stat-ribbon, .protection-list, .command-list, .faq-list, .steps, .pair-grid').forEach((parent) => {
    Array.from(parent.children).forEach((child, i) => {
      if (child.classList.contains('reveal') && !child.style.getPropertyValue('--reveal-delay')) {
        child.style.setProperty('--reveal-delay', `${Math.min(i, 8) * 60}ms`);
      }
    });
  });
  observeReveal(Array.from(targets));
}

function enhanceHero() {
  const chat = document.querySelector('.hero .chat-window');
  if (chat && !reducedMotion) chat.classList.add('is-floating');
}

let revealTimer;
function scheduleReveal() {
  window.clearTimeout(revealTimer);
  revealTimer = window.setTimeout(applyAutoReveal, 80);
}

(async () => {
  try { await populateSiteData(); } catch {}
  enhanceHero();
  applyAutoReveal();
  window.setTimeout(applyAutoReveal, 300);
  window.setTimeout(applyAutoReveal, 1200);
})();

if (!reducedMotion && 'MutationObserver' in document.body) {
  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.addedNodes && m.addedNodes.length) { scheduleReveal(); break; }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
}

// Exposer pour scripts page (ex. catalogue commandes)
window.djousseReveal = { apply: applyAutoReveal, observe: observeReveal };

if (!reducedMotion && 'IntersectionObserver' in window) {
  observeReveal(Array.from(document.querySelectorAll('[data-reveal]')));
} else {
  document.querySelectorAll('.reveal, [data-reveal]').forEach((el) => el.classList.add('is-visible'));
}
