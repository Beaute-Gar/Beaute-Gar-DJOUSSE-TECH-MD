(function () {
  // Suivi d’événements (activé uniquement après consentement "mesure d’audience").
  function track(name, data) {
    try {
      var consent = window.djsConsent && window.djsConsent.get ? window.djsConsent.get() : null;
      if (!consent || !consent.analytics) return;
      if (window.va) window.va('event', { name: name, data: data || {} });
    } catch (e) {}
  }

  document.addEventListener('click', function (e) {
    var cta = e.target.closest('[data-track-cta]');
    if (cta) {
      track('cta_click', { id: cta.getAttribute('data-track-cta') || cta.textContent.trim().slice(0, 40) });
    }
  });

  document.addEventListener('djousse:form-success', function (e) {
    var detail = e.detail || {};
    track('form_submit', { form: detail.form || 'unknown', status: 'success' });
  });

  window.djsTrack = track;
})();
