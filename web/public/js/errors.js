(function () {
  // Sentry (optionnel, respectueux) : ne s'active qu'après consentement "mesure d’audience"
  // et uniquement si window.SENTRY_DSN est défini (à injecter côté déploiement, sans PII).
  var loaded = false;
  function scrub(event) {
    try {
      if (event && event.request) { delete event.request.cookies; delete event.request.headers; }
      if (event && event.user) { event.user = { id: '[redacted]' }; }
    } catch (e) {}
    return event;
  }
  function load() {
    if (loaded || !window.SENTRY_DSN) return;
    loaded = true;
    var s = document.createElement('script');
    s.src = 'https://browser.sentry-cdn.com/8.0.0/bundle.tracing.replay.min.js';
    s.crossOrigin = 'anonymous';
    s.onload = function () {
      if (!window.Sentry) return;
      try {
        window.Sentry.init({
          dsn: window.SENTRY_DSN,
          environment: window.SENTRY_ENV || 'production',
          tracesSampleRate: 0,
          replaysSessionSampleRate: 0,
          replaysOnErrorSampleRate: 0,
          beforeSend: scrub
        });
      } catch (e) {}
    };
    s.onerror = function () {};
    document.head.appendChild(s);
  }
  document.addEventListener('djousse:consent', function (e) {
    if (e.detail && e.detail.analytics) load();
  });
  try {
    var c = window.djsConsent && window.djsConsent.get ? window.djsConsent.get() : null;
    if (c && c.analytics) load();
  } catch (e) {}
})();
