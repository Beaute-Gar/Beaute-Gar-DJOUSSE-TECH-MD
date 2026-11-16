(function () {
  var splash = document.getElementById('djSplash');
  var loading = document.getElementById('djSplashLoading');
  var welcome = document.getElementById('djSplashWelcome');
  var bar = document.getElementById('djSplashBar');
  var percent = document.getElementById('djSplashPercent');
  var enter = document.getElementById('djSplashEnter');
  var site = document.getElementById('djSiteRoot');
  var logoImg = document.getElementById('djSplashLogoImg');
  var avatar = document.getElementById('djSplashAvatar');
  if (!splash || !loading || !welcome || !bar || !percent || !enter || !site) return;

  // Variante visuelle aléatoire à chaque visite (Android / PC)
  var variants = ['dj-anim-neon', 'dj-anim-matrix', 'dj-anim-solar', 'dj-anim-aurora', 'dj-anim-crimson'];
  var variant = variants[Math.floor(Math.random() * variants.length)];
  splash.classList.add(variant);

  // Lignes de chargement aléatoires selon la variante
  var lineSets = {
    'dj-anim-neon': [
      '> Initialisation du système...',
      '> Chargement de la base de données...',
      '> Connexion aux serveurs WhatsApp...',
      '> Vérification des protections...',
      '> Prêt'
    ],
    'dj-anim-matrix': [
      '> Boot sequence: OK',
      '> Décryptage des modules...',
      '> Liaison canaux sécurisés...',
      '> Synchronisation des gardes...',
      '> Accès accordé'
    ],
    'dj-anim-solar': [
      '> Réveil des services...',
      '> Calibration des outils...',
      '> Chargement des menus...',
      '> Mise en orbite du bot...',
      '> Système opérationnel'
    ],
    'dj-anim-aurora': [
      '> Ouverture de session...',
      '> Flux de données en cours...',
      '> Préparation de l’interface...',
      '> Connexion des passerelles...',
      '> Tout est prêt'
    ],
    'dj-anim-crimson': [
      '> Scan de sécurité...',
      '> Activation de DJOUSSE GUARD...',
      '> Verrouillage des protections...',
      '> Contrôle des accès...',
      '> Défenses actives'
    ]
  };
  var linesBox = loading.querySelector('.dj-splash-lines');
  var chosenLines = lineSets[variant] || lineSets['dj-anim-neon'];
  if (linesBox) {
    linesBox.innerHTML = '';
    for (var i = 0; i < chosenLines.length; i++) {
      var line = document.createElement('div');
      line.className = 'dj-splash-line';
      if (i === chosenLines.length - 1) {
        line.textContent = chosenLines[i] + ' ';
        var cur = document.createElement('span');
        cur.className = 'dj-splash-cursor';
        cur.setAttribute('aria-hidden', 'true');
        line.appendChild(cur);
      } else {
        line.textContent = chosenLines[i];
      }
      linesBox.appendChild(line);
    }
  }

  if (logoImg && avatar) {
    logoImg.addEventListener('error', function () {
      logoImg.remove();
      avatar.hidden = false;
    });
  }

  var progress = 0;
  var done = false;

  function showWelcome() {
    if (done) return;
    done = true;
    loading.hidden = true;
    welcome.hidden = false;
    // force reflow for fade-in
    void welcome.offsetWidth;
    welcome.classList.add('is-visible');
  }

  function finish() {
    splash.classList.add('dj-splash-fadeout');
    site.classList.add('is-visible');
    document.body.classList.remove('dj-splash-active');
    setTimeout(function () {
      if (splash && splash.parentNode) splash.parentNode.removeChild(splash);
    }, 700);
    try { sessionStorage.setItem('djSplashSeen', '1'); } catch (e) {}
  }

  // Progress bar fills 0->100% over ~5s
  var start = Date.now();
  var duration = 5000;
  function tickBar() {
    var t = Math.min(1, (Date.now() - start) / duration);
    var w = Math.round(t * 100);
    bar.style.width = w + '%';
    if (t < 1) requestAnimationFrame(tickBar);
  }
  requestAnimationFrame(tickBar);

  // Random percentage increment 0->100
  function tickPercent() {
    if (progress >= 100) {
      progress = 100;
      percent.textContent = '100';
      setTimeout(showWelcome, 350);
      return;
    }
    var step = Math.floor(Math.random() * 12) + 3; // 3-14
    progress = Math.min(100, progress + step);
    percent.textContent = String(progress);
    var delay = Math.floor(Math.random() * 220) + 120; // 120-340ms
    setTimeout(tickPercent, delay);
  }
  setTimeout(tickPercent, 250);

  enter.addEventListener('click', finish);
  enter.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish(); }
  });
})();
