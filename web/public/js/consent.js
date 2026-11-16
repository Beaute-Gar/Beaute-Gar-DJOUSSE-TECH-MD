(function () {
  var KEY = 'djousse-consent-v1';
  var defaults = { essential: true, analytics: false, decided: false, ts: null };

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return Object.assign({}, defaults);
      var data = JSON.parse(raw);
      return {
        essential: true,
        analytics: !!data.analytics,
        decided: !!data.decided,
        ts: data.ts || null
      };
    } catch (e) {
      return Object.assign({}, defaults);
    }
  }

  function save(state) {
    state.essential = true;
    state.ts = new Date().toISOString();
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    document.dispatchEvent(new CustomEvent('djousse:consent', { detail: Object.assign({}, state) }));
  }

  var state = load();
  window.djsConsent = {
    get: function () { return Object.assign({}, state); },
    acceptAll: function () { state.analytics = true; state.decided = true; save(state); hideBanner(); closePrefs(); apply(); },
    refuseAll: function () { state.analytics = false; state.decided = true; save(state); hideBanner(); closePrefs(); apply(); },
    open: function () { openPrefs(); },
    savePrefs: function (analytics) { state.analytics = !!analytics; state.decided = true; save(state); hideBanner(); closePrefs(); apply(); }
  };

  function apply() {
    if (state.analytics) loadAnalytics();
  }

  function loadAnalytics() {
    if (window.__djsAnalyticsLoaded) return;
    // Ne charge le script Vercel que s'il est réellement activé sur le projet.
    // Par défaut il ne l'est pas : éviter un 404 /_vercel/insights/script.js
    // (surtout sur les previews Vercel et en local).
    if (window.DJS_ANALYTICS_ENABLED !== true) return;
    window.__djsAnalyticsLoaded = true;
    var s = document.createElement('script');
    s.defer = true;
    s.src = '/_vercel/insights/script.js';
    s.onerror = function () { /* analytics non disponible (preview/local) */ };
    document.head.appendChild(s);
  }

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  var banner, prefs, overlay;

  function buildBanner() {
    banner = el('section', { class: 'cookie-banner', role: 'dialog', 'aria-modal': 'false', 'aria-label': 'Consentement aux cookies', 'aria-live': 'polite' }, [
      el('div', { class: 'cookie-banner__inner' }, [
        el('div', { class: 'cookie-banner__text' }, [
          el('p', { class: 'cookie-banner__title', text: 'Respect de votre vie privée' }),
          el('p', { class: 'cookie-banner__desc' }, []),
          (function(){
            var p = document.createElement('p');
            p.className = 'cookie-banner__desc';
            p.innerHTML = 'Nous utilisons des cookies essentiels au fonctionnement du site. Avec votre accord, nous pouvons activer une mesure d’audience respectueuse. Consultez notre <a href="./politique-de-confidentialite.html">politique de confidentialité</a>.';
            return p;
          })()
        ]),
        el('div', { class: 'cookie-banner__actions' }, [
          el('button', { type: 'button', class: 'button button--primary cookie-btn', 'data-consent': 'accept', text: 'Tout accepter' }),
          el('button', { type: 'button', class: 'button button--primary cookie-btn', 'data-consent': 'refuse', text: 'Tout refuser' }),
          el('button', { type: 'button', class: 'button button--primary cookie-btn', 'data-consent': 'custom', text: 'Personnaliser' })
        ])
      ])
    ]);
    banner.querySelector('[data-consent="accept"]').addEventListener('click', window.djsConsent.acceptAll);
    banner.querySelector('[data-consent="refuse"]').addEventListener('click', window.djsConsent.refuseAll);
    banner.querySelector('[data-consent="custom"]').addEventListener('click', openPrefs);
    document.body.appendChild(banner);
  }

  function buildPrefs() {
    overlay = el('div', { class: 'cookie-overlay', hidden: '' });
    prefs = el('div', { class: 'cookie-prefs', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Préférences de cookies', hidden: '' }, [
      el('div', { class: 'cookie-prefs__panel' }, [
        el('h2', { class: 'cookie-prefs__title', text: 'Préférences de confidentialité' }),
        el('p', { class: 'muted', text: 'Choisissez les catégories autorisées. Les cookies essentiels sont nécessaires au fonctionnement du site.' }),
        (function(){
          var wrap = el('div', { class: 'cookie-prefs__rows' });
          var row1 = el('label', { class: 'cookie-row' });
          row1.innerHTML = '<span><strong>Essentiels</strong><br><span class="muted small">Thème, sécurité, mémorisation de votre choix.</span></span><input type="checkbox" checked disabled aria-label="Cookies essentiels (toujours actifs)">';
          var row2 = el('label', { class: 'cookie-row' });
          row2.innerHTML = '<span><strong>Mesure d’audience</strong><br><span class="muted small">Statistiques anonymisées/agrégées de fréquentation (si activé).</span></span><input type="checkbox" id="consent-analytics" aria-label="Autoriser la mesure d’audience">';
          wrap.appendChild(row1); wrap.appendChild(row2);
          return wrap;
        })(),
        el('div', { class: 'cookie-prefs__actions' }, [
          el('button', { type: 'button', class: 'button button--primary cookie-btn', id: 'consent-save', text: 'Enregistrer mes choix' }),
          el('button', { type: 'button', class: 'button cookie-btn', id: 'consent-cancel', text: 'Fermer' })
        ])
      ])
    ]);
    overlay.addEventListener('click', closePrefs);
    prefs.querySelector('#consent-cancel').addEventListener('click', closePrefs);
    prefs.querySelector('#consent-save').addEventListener('click', function () {
      var a = prefs.querySelector('#consent-analytics');
      window.djsConsent.savePrefs(a && a.checked);
    });
    document.body.appendChild(overlay);
    document.body.appendChild(prefs);
  }

  function hideBanner() { if (banner) banner.hidden = true; }
  function openPrefs() {
    if (!prefs) buildPrefs();
    var a = prefs.querySelector('#consent-analytics');
    if (a) a.checked = !!state.analytics;
    overlay.hidden = false; prefs.hidden = false;
    var btn = prefs.querySelector('#consent-save');
    if (btn) btn.focus();
  }
  function closePrefs() { if (overlay) overlay.hidden = true; if (prefs) prefs.hidden = true; }

  function bindManageLinks() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-manage-cookies]');
      if (!t) return;
      e.preventDefault();
      openPrefs();
    });
  }

  function init() {
    bindManageLinks();
    buildBanner();
    if (state.decided) hideBanner();
    apply();
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && prefs && !prefs.hidden) closePrefs();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
