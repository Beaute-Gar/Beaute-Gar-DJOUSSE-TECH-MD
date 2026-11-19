(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  function uiLog() {
    var args = Array.prototype.slice.call(arguments);
    try { console.log.apply(console, ['[ui]'].concat(args)); } catch (e) {}
    try {
      var el = $('logs');
      if (el) {
        var line = args.map(function (a) { return typeof a === 'string' ? a : JSON.stringify(a); }).join(' ');
        var lines = (el.textContent ? el.textContent.split('\n') : []);
        lines.push('[ui] ' + line);
        if (lines.length > 200) lines = lines.slice(-200);
        el.textContent = lines.join('\n');
        el.scrollTop = el.scrollHeight;
      }
    } catch (e) {}
  }
  uiLog('app.js charge ; Capacitor=' + (window.Capacitor ? 'oui' : 'non'));

  function getNodeJS() {
    if (window.CapacitorNodeJS) { uiLog('plugin trouve : window.CapacitorNodeJS'); return window.CapacitorNodeJS; }
    var cap = window.Capacitor;
    if (!cap) { uiLog('window.Capacitor ABSENT'); return null; }
    var P = cap.Plugins || {};
    if (P.NodeJS) { uiLog('plugin trouve : Capacitor.Plugins.NodeJS'); return P.NodeJS; }
    if (P.CapacitorNodeJS) { uiLog('plugin trouve : Capacitor.Plugins.CapacitorNodeJS'); return P.CapacitorNodeJS; }
    if (typeof cap.registerPlugin === 'function') {
      try {
        var p = cap.registerPlugin('CapacitorNodeJS');
        uiLog('plugin enregistre manuellement : CapacitorNodeJS');
        return p;
      } catch (e) { uiLog('registerPlugin a echoue : ' + e); }
    }
    uiLog('AUCUN plugin NodeJS trouve. Plugins disponibles : ' + Object.keys(P).join(','));
    return null;
  }

  function getBotService() {
    var cap = window.Capacitor;
    if (!cap) return null;
    var P = cap.Plugins || {};
    if (P.BotService) return P.BotService;
    if (typeof cap.registerPlugin === 'function') {
      try { return cap.registerPlugin('BotService'); } catch (e) {}
    }
    return null;
  }

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  };

  var COUNTRIES = [
    ['Cameroun', '237'], ["Côte d'Ivoire", '225'], ['Sénégal', '221'], ['Gabon', '241'],
    ['Congo', '242'], ['RD Congo', '243'], ['Bénin', '229'], ['Togo', '228'], ['Mali', '223'],
    ['Burkina Faso', '226'], ['Guinée', '224'], ['Tchad', '235'], ['Niger', '227'],
    ['Maroc', '212'], ['Algérie', '213'], ['Tunisie', '216'], ['Nigeria', '234'],
    ['France', '33'], ['Belgique', '32'], ['Suisse', '41'], ['Canada / USA', '1']
  ];
  var LABELS = {
    idle: ['Jumelage requis', 'warn'], starting: ['Préparation…', 'warn'], waiting_socket: ['Préparation…', 'warn'],
    needs_pairing: ['Jumelage requis', 'warn'], awaiting_link: ['En attente de liaison', 'warn'],
    connecting: ['Connexion…', 'warn'], connected: ['Connecté', 'ok'], disconnected: ['Reconnexion…', 'warn'],
    logged_out: ['Session fermée', 'err'], crashed: ['Erreur', 'err'], stopped: ['Arrêté', 'err']
  };
  var TIPS = {
    xiaomi: 'Xiaomi/Redmi/Poco : Sécurité › Démarrage automatique : active DJOUSSE TECH MD. Batterie › Aucune restriction. Verrouille l\'appli dans les applis récentes.',
    tecno: 'Tecno/Infinix/itel : Gestionnaire de téléphone › Démarrage automatique : active l\'appli. Batterie : aucune restriction. Verrouille l\'appli dans les récentes.',
    samsung: 'Samsung : Batterie › Limites d\'utilisation en arrière-plan › retire l\'appli des applis en veille. Verrouille-la dans les récentes.',
    other: 'Autorise le démarrage automatique et retire toute restriction de batterie pour cette appli, puis verrouille-la dans les applis récentes.'
  };

  function on(name, fn) {
    var NodeJS = getNodeJS();
    if (!NodeJS) { uiLog('impossible de ecouter ' + name + ' : plugin absent'); return; }
    try {
      NodeJS.addListener(name, function (e) {
        var a = (e && e.args && e.args[0] !== undefined) ? e.args[0] : e;
        try { uiLog('<- ' + name + ' ' + JSON.stringify(a)); } catch (x) { uiLog('<- ' + name + ' (non serialisable)'); }
        try { fn(a || {}); } catch (x) { console.error(x); uiLog('ERREUR handler ' + name + ' : ' + x); }
      });
      uiLog('ecoute active : ' + name);
    } catch (e) { uiLog('addListener(' + name + ') a echoue : ' + e); }
  }
  function send(name, payload) {
    var NodeJS = getNodeJS();
    if (!NodeJS) { uiLog('-> ' + name + ' impossible : plugin absent'); return Promise.resolve(); }
    uiLog('-> ' + name + ' ' + JSON.stringify(payload || {}));
    try {
      return Promise.resolve(NodeJS.send({ eventName: name, args: [payload || {}] }))
        .catch(function (e) { uiLog('send(' + name + ') a echoue : ' + e); });
    } catch (e) { uiLog('send(' + name + ') exception : ' + e); return Promise.resolve(); }
  }
  function setBadge(text, kind) { var b = $('badge'); if (b) { b.textContent = text; b.className = 'badge ' + kind; } }
  function show(id, v) { var el = $(id); if (el) el.hidden = !v; }

  // ---- Numéro ----
  function buildNumber(dial, raw) {
    var s = String(raw || '').trim();
    var full = s.charAt(0) === '+' || s.slice(0, 2) === '00';
    var d = s.replace(/\D/g, '');
    if (s.slice(0, 2) === '00') d = d.slice(2);
    if (full) return d;
    return dial + d.replace(/^0+/, '');
  }

  // ---- Rendu du statut ----
  var lastState = 'needs_pairing';
  function render(st) {
    lastState = st.state || 'needs_pairing';
    var l = LABELS[lastState] || [lastState, 'warn'];
    setBadge(l[0], l[1]);
    if ($('st-text')) $('st-text').textContent = l[0];
    if ($('st-num')) $('st-num').textContent = st.number ? '+' + st.number : '—';
    show('s-pair', lastState !== 'connected' && lastState !== 'connecting');
    show('s-status', true);
    var Svc = getBotService();
    if (lastState === 'connected' && Svc) { Svc.setPaired({ paired: true }).catch(function () {}); }
    if (lastState === 'connected') { show('code-box', false); if ($('pair-msg')) $('pair-msg').textContent = ''; }
    if (lastState === 'crashed' && st.message) addLog('ERREUR : ' + st.message);
  }
  function addLog(line) {
    var el = $('logs');
    if (!el) return;
    var lines = (el.textContent ? el.textContent.split('\n') : []);
    lines.push(line);
    if (lines.length > 200) lines = lines.slice(-200);
    el.textContent = lines.join('\n');
    el.scrollTop = el.scrollHeight;
  }

  // ---- Batterie / démarrage auto ----
  function refreshBattery() {
    var Svc = getBotService();
    if (!Svc) { if ($('bat-state')) $('bat-state').textContent = 'n/a'; return; }
    Svc.isBatteryExempt().then(function (r) {
      if ($('bat-state')) {
        $('bat-state').textContent = r.exempt ? 'Autorisé' : 'Restreint';
        $('bat-state').style.color = r.exempt ? 'var(--ok)' : 'var(--warn)';
      }
    }).catch(function () { if ($('bat-state')) $('bat-state').textContent = '?'; });
  }
  function showTips() {
    var Svc = getBotService();
    if (!Svc) { if ($('tips')) $('tips').textContent = TIPS.other; return; }
    Svc.deviceInfo().then(function (d) {
      var m = d.manufacturer || '';
      var k = /xiaomi|redmi|poco/.test(m) ? 'xiaomi' : /tecno|infinix|itel|transsion/.test(m) ? 'tecno' : /samsung/.test(m) ? 'samsung' : 'other';
      if ($('tips')) $('tips').textContent = TIPS[k];
    }).catch(function () { if ($('tips')) $('tips').textContent = TIPS.other; });
  }

  // ---- Démarrage du moteur ----
  var booted = false;
  async function boot() {
    if (booted) { uiLog('boot() deja effectue'); return; }
    booted = true;
    uiLog('boot() demarre');
    show('s-setup', true);
    show('s-pair', true);
    refreshBattery(); showTips();

    var NodeJS = getNodeJS();
    if (!NodeJS) {
      for (var retries = 0; retries < 10 && !NodeJS; retries++) {
        await new Promise(function (r) { setTimeout(r, 200); });
        NodeJS = getNodeJS();
      }
    }

    if (!NodeJS) {
      setBadge('Aperçu hors appli', 'warn');
      uiLog('plugin NodeJS introuvable apres 2 s');
      show('s-pair', true);
      return;
    }

    setBadge('Jumelage requis', 'warn');

    on('node:ready', function (p) {
      uiLog('NODE PRET : version=' + (p && p.node) + ' data=' + (p && p.data));
      send('bot:status:get'); send('bot:logs:get');
    });
    on('bot:status', render);
    on('bot:log', function (p) { if (p.line) addLog(p.line); });
    on('bot:logs', function (p) { if ($('logs')) $('logs').textContent = (p.lines || []).join('\n'); });
    on('pair:code', function (p) {
      clearTimeout(pairTimer);
      if ($('code')) $('code').textContent = p.code;
      show('code-box', true);
      if ($('pair-msg')) $('pair-msg').textContent = 'Saisis ce code dans WhatsApp (il expire au bout de quelques minutes).';
      if ($('btn-pair')) $('btn-pair').disabled = false;
      uiLog('CODE DE JUMELAGE RECU');
    });
    on('pair:error', function (p) {
      clearTimeout(pairTimer);
      if ($('pair-msg')) $('pair-msg').textContent = p.message || 'Erreur.';
      if ($('btn-pair')) $('btn-pair').disabled = false;
      uiLog('ERREUR JUMELAGE : ' + (p && p.message));
    });
    on('session:reset:done', function () {
      var Svc = getBotService();
      if (Svc) { Svc.setPaired({ paired: false }).catch(function () {}); Svc.restartApp().catch(function () {}); }
      if ($('pair-msg')) $('pair-msg').textContent = 'Session supprimée. Rouvre l\'appli si elle ne redémarre pas seule.';
    });

    var Svc = getBotService();
    try { if (Svc) { await Svc.requestNotifications(); await Svc.start(); } } catch (e) { addLog('Service : ' + e); uiLog('service : ' + e); }
    try {
      uiLog('appel NodeJS.start()');
      await NodeJS.start({ nodeDir: 'nodejs', script: 'main.cjs' });
      uiLog('NodeJS.start() OK');
    } catch (e) {
      addLog('Node déjà démarré ou info : ' + e);
      uiLog('NodeJS.start() : ' + e);
    }
    try { if (NodeJS.whenReady) { await NodeJS.whenReady(); uiLog('whenReady() OK'); } } catch (e) { uiLog('whenReady() : ' + e); }
    send('bot:status:get'); send('bot:logs:get');
  }

  // ---- Actions ----
  var pairTimer = null;
  function init() {
    COUNTRIES.forEach(function (c) {
      var o = document.createElement('option'); o.value = c[1]; o.textContent = c[0] + ' (+' + c[1] + ')';
      if ($('country')) $('country').appendChild(o);
    });
    if ($('accept')) $('accept').onchange = function () { if ($('btn-accept')) $('btn-accept').disabled = !$('accept').checked; };
    if ($('btn-accept')) $('btn-accept').onclick = function () { store.set('accepted', '1'); show('s-warn', false); boot(); };
    if ($('btn-bat')) $('btn-bat').onclick = function () { var Svc = getBotService(); if (Svc) Svc.requestBatteryExemption().catch(function () {}); };
    if ($('btn-auto')) $('btn-auto').onclick = function () { var Svc = getBotService(); if (Svc) Svc.openAutoStartSettings().catch(function () {}); };
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { refreshBattery(); send('bot:status:get'); } });

    if ($('btn-pair')) {
      $('btn-pair').onclick = function () {
        var num = buildNumber($('country').value, $('num').value);
        uiLog('clic Obtenir le code : numero=+' + num);
        if (num.length < 8 || num.length > 15) {
          if ($('pair-msg')) $('pair-msg').textContent = 'Numéro invalide. Vérifie le pays et le numéro.';
          uiLog('numero invalide (longueur ' + num.length + ')');
          return;
        }
        $('btn-pair').disabled = true;

        // Affiche immédiatement la boîte de code avec un placeholder de chargement
        if ($('code')) $('code').textContent = '••••-••••';
        show('code-box', true);
        if ($('pair-msg')) $('pair-msg').textContent = 'Génération du code pour +' + num + '…';

        send('pair:request', { number: num });
        send('bot:status:get');
        clearTimeout(pairTimer);
        pairTimer = setTimeout(function () {
          if ($('code') && $('code').textContent.indexOf('•') !== -1) {
            if ($('pair-msg')) $('pair-msg').textContent = 'Connexion en cours… Si le code ne s\'affiche pas, vérifie ta connexion internet ou réessaie.';
            $('btn-pair').disabled = false;
            uiLog('WATCHDOG 45 s : aucun code recu');
            send('bot:logs:get');
          }
        }, 45000);
      };
    }

    if ($('btn-copy')) {
      $('btn-copy').onclick = function () {
        var t = $('code') ? $('code').textContent : '';
        if (navigator.clipboard) {
          navigator.clipboard.writeText(t).then(function () {
            $('btn-copy').textContent = 'Copié';
            setTimeout(function () { $('btn-copy').textContent = 'Copier le code'; }, 1500);
          });
        }
      };
    }

    if ($('btn-reset')) {
      $('btn-reset').onclick = function () {
        if (confirm('Supprimer la session WhatsApp de ce téléphone ? Il faudra refaire le jumelage.')) send('session:reset');
      };
    }

    if (store.get('accepted') === '1') boot(); else show('s-warn', true);
  }
  document.addEventListener('DOMContentLoaded', init);
})();
