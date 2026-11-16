import { ApiError, getPairingCode, getStatus } from './api.js';

const form = document.querySelector('[data-pair-form]');
const submitButton = document.querySelector('[data-pair-submit]');
const numberField = document.querySelector('[data-phone-number]');
const countryField = document.querySelector('[data-country-code]');
const consentField = document.querySelector('[data-pair-consent]');
const honeypot = form?.querySelector('input[name="website"]');
const codeBox = document.querySelector('[data-pair-code]');
const statusLine = document.querySelector('[data-pair-message]');
const connectionBadge = document.querySelector('[data-connection-status]');
const copyCode = document.querySelector('[data-copy-pair-code]');
const statusCount = document.querySelector('[data-status-connection]');
const phoneError = document.querySelector('[data-phone-error]');
const consentError = document.querySelector('[data-consent-error]');
const countdownEl = document.querySelector('[data-code-countdown]');
let statusTimer;
let controller;
let codeTimer;
let codeExpiresAt = 0;

function flagEmoji(iso) {
  return String(iso || '').toUpperCase().replace(/[A-Z]/g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

function populateCountries() {
  const list = window.DJS_COUNTRIES;
  if (!countryField || !Array.isArray(list) || !list.length) return;

  const current = String(countryField.value || '237').replace(/\D/g, '');
  const sorted = [...list].sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr'));
  countryField.innerHTML = '';

  for (const item of sorted) {
    const dial = String(item.dial || '').replace(/\D/g, '');
    if (!dial) continue;
    const option = document.createElement('option');
    option.value = dial;
    option.textContent = `${flagEmoji(item.iso)} +${dial} ${item.name}`;
    countryField.appendChild(option);
  }

  if ([...countryField.options].some((o) => o.value === current)) {
    countryField.value = current;
  } else {
    countryField.value = '237';
  }
}

populateCountries();

function clearCodeTimer() {
  if (codeTimer) {
    window.clearTimeout(codeTimer);
    codeTimer = 0;
  }
}

function resetCodeDisplay(message) {
  clearCodeTimer();
  codeExpiresAt = 0;
  if (codeBox) codeBox.textContent = '••••  ••••';
  if (copyCode) copyCode.hidden = true;
  if (countdownEl) countdownEl.textContent = '60 secondes';
  if (message) setMessage(message, 'error');
}

function startCodeCountdown(seconds = 60) {
  clearCodeTimer();
  codeExpiresAt = Date.now() + seconds * 1000;
  if (copyCode) copyCode.hidden = false;

  function tick() {
    const remaining = Math.max(0, Math.ceil((codeExpiresAt - Date.now()) / 1000));
    if (countdownEl) countdownEl.textContent = remaining > 0 ? `${remaining} seconde${remaining > 1 ? 's' : ''}` : 'expiré';
    if (remaining <= 0) {
      clearCodeTimer();
      codeExpiresAt = 0;
      if (codeBox) codeBox.textContent = '••••  ••••';
      if (copyCode) copyCode.hidden = true;
      setMessage('Code expiré. Clique à nouveau sur « Obtenir mon code » et saisis-le immédiatement dans WhatsApp.', 'error');
      return;
    }
    codeTimer = window.setTimeout(tick, 250);
  }

  tick();
}

function formatPhoneNumber(value, countryCode) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (countryCode === '1') {
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }
  if (countryCode === '33' || countryCode === '237' || digits.length >= 8) {
    return digits.slice(0, 10).replace(/(\d{1,3})(\d{2})?(\d{2})?(\d{2})?(\d{2})?/, (_m, p1, p2, p3, p4, p5) => [p1, p2, p3, p4, p5].filter(Boolean).join(' '));
  }
  return digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
}

numberField?.addEventListener('input', (e) => {
  const countryDigits = String(countryField?.value || '').replace(/\D/g, '');
  e.target.value = formatPhoneNumber(e.target.value, countryDigits);
  if (phoneError) phoneError.textContent = '';
  numberField.setAttribute('aria-invalid', 'false');
});

countryField?.addEventListener('change', () => {
  if (numberField) {
    numberField.value = formatPhoneNumber(numberField.value, String(countryField.value || '').replace(/\D/g, ''));
  }
});

consentField?.addEventListener('change', () => {
  if (consentError) consentError.textContent = '';
  consentField.setAttribute('aria-invalid', 'false');
});

function setMessage(message, state = 'info') {
  if (!statusLine) return;
  statusLine.textContent = message;
  statusLine.dataset.state = state;
}

function setBusy(busy) {
  if (!submitButton) return;
  submitButton.disabled = busy;
  submitButton.textContent = busy ? 'Demande en cours…' : 'Obtenir mon code';
  submitButton.setAttribute('aria-busy', busy ? 'true' : 'false');
}

function setFieldError(field, errorEl, message) {
  if (errorEl) errorEl.textContent = message || '';
  if (field) field.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function validate() {
  let ok = true;
  const digits = String(numberField?.value || '').replace(/\D/g, '');
  const countryDigits = String(countryField?.value || '').replace(/\D/g, '');
  const full = `${countryDigits}${digits}`.replace(/\D/g, '');

  setFieldError(numberField, phoneError, '');
  setFieldError(consentField, consentError, '');

  if (!digits) {
    setFieldError(numberField, phoneError, 'Indique ton numéro de téléphone.');
    ok = false;
  } else if (!/^\d{8,15}$/.test(full)) {
    setFieldError(numberField, phoneError, 'Le numéro complet (indicatif inclus) doit contenir entre 8 et 15 chiffres.');
    ok = false;
  }
  if (!consentField?.checked) {
    setFieldError(consentField, consentError, 'Tu dois accepter la politique de confidentialité pour envoyer la demande.');
    ok = false;
  }
  if (!ok) setMessage('Corrige les champs indiqués puis réessaie.', 'error');
  return { ok, full };
}

async function copyPairCode() {
  const value = String(codeBox?.textContent || '').replace(/\s+/g, '');
  if (!value || value.includes('•')) return setMessage('Demande d’abord un code de jumelage.', 'error');
  if (!codeExpiresAt || Date.now() >= codeExpiresAt) return setMessage('Ce code a expiré. Demande-en un nouveau.', 'error');
  try {
    await navigator.clipboard.writeText(value);
    setMessage('Code copié. Ouvre WhatsApp pour l’associer.', 'success');
  } catch {
    setMessage('Copie automatique impossible. Copie le code manuellement.', 'error');
  }
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const { ok, full } = validate();
  if (!ok) return;

  // Honeypot: envoi silencieusement "réussi" côté UI, rien côté serveur utile.
  if (honeypot && String(honeypot.value || '').trim()) {
    setMessage('Demande reçue.', 'success');
    return;
  }

  controller?.abort();
  controller = new AbortController();
  clearCodeTimer();
  codeExpiresAt = 0;
  if (copyCode) copyCode.hidden = true;
  if (codeBox) codeBox.textContent = '••••  ••••';
  setBusy(true);
  setMessage('Demande du code de jumelage en cours…', 'info');
  try {
    const payload = { number: full, consent: true };
    const turnstile = form.querySelector('[name="cf-turnstile-response"]');
    if (turnstile && turnstile.value) payload.turnstileToken = turnstile.value;
    const result = await getPairingCode(payload, { signal: controller.signal });
    if (codeBox) codeBox.textContent = result.code || '— — — —';
    startCodeCountdown(60);
    setMessage(`Code reçu pour +${full}. Ouvre WhatsApp > Appareils connectés > Associer avec un numéro, puis saisis-le immédiatement (valable 60 s).`, 'success');
    document.dispatchEvent(new CustomEvent('djousse:form-success', { detail: { form: 'pairing' } }));
  } catch (error) {
    if (error?.name === 'AbortError') return;
    resetCodeDisplay('');
    const text = error instanceof ApiError ? error.message : 'Service de jumelage indisponible pour le moment.';
    const state = error instanceof ApiError && (error.kind === 'validation' || error.kind === 'session' || error.kind === 'rate-limit') ? 'error' : 'info';
    setMessage(text, state);
  } finally {
    setBusy(false);
  }
});

copyCode?.addEventListener('click', copyPairCode);

async function refreshStatus() {
  if (!connectionBadge) return;
  try {
    const status = await getStatus();
    const connected = Boolean(status.connected);
    connectionBadge.textContent = connected ? 'Service connecté' : 'Service en attente';
    connectionBadge.dataset.state = connected ? 'online' : 'checking';
    if (statusCount) {
      const sessions = status.sessions ?? status.active;
      statusCount.textContent = typeof sessions === 'number' ? `${sessions} session(s) déclarée(s)` : 'État de connexion transmis par le service.';
    }
  } catch {
    connectionBadge.textContent = 'Service indisponible';
    connectionBadge.dataset.state = 'offline';
    if (statusCount) statusCount.textContent = 'Le service de jumelage ne répond pas pour le moment. Tu peux réessayer plus tard.';
  }
}

async function startStatusPolling() {
  if (!connectionBadge) return;
  await refreshStatus();
  statusTimer = window.setInterval(() => { if (document.visibilityState === 'visible') refreshStatus(); }, 30000);
}

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshStatus(); });
window.addEventListener('beforeunload', () => { if (statusTimer) window.clearInterval(statusTimer); controller?.abort(); });

startStatusPolling();
