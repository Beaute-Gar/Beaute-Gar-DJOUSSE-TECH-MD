const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const BODY_MAX = 2048;
const hits = new Map();

function sendJson(res, status, payload, origin) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin',
  };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  res.writeHead(status, headers);
  res.end(JSON.stringify(payload));
}

function normalizedOrigin(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return '';
  }
}

function requestOrigin(req) {
  const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const forwardedProto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return forwardedHost ? normalizedOrigin(`${forwardedProto}://${forwardedHost}`) : '';
}

function resolveAllowedOrigin(req) {
  const originHeader = String(req.headers.origin || '');
  if (!originHeader) return { originHeader, allowed: '' };
  const normalized = normalizedOrigin(originHeader);
  const configured = normalizedOrigin(process.env.SITE_ORIGIN || '');
  const self = requestOrigin(req);
  const allowed = (normalized && (normalized === configured || normalized === self)) ? normalized : '';
  return { originHeader, allowed };
}

function clientIp(req) {
  const direct = req.headers['x-real-ip'];
  const forwarded = req.headers['x-forwarded-for'];
  return String(direct || forwarded || 'unknown').split(',')[0].trim().slice(0, 100) || 'unknown';
}

function overLimit(ip) {
  const now = Date.now();
  const current = (hits.get(ip) || []).filter((time) => now - time < RATE_WINDOW_MS);
  if (current.length >= RATE_MAX) {
    hits.set(ip, current);
    return true;
  }
  current.push(now);
  hits.set(ip, current);
  if (hits.size > 2000) {
    for (const [key, times] of hits) if (!times.length || now - times[times.length - 1] >= RATE_WINDOW_MS) hits.delete(key);
  }
  return false;
}

async function readPayload(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > BODY_MAX) throw new Error('too-large');
  }
  try { return JSON.parse(raw || '{}'); } catch { throw new Error('invalid-json'); }
}

function pairingApiUrl(pathname) {
  const configured = process.env.PAIRING_API_URL;
  if (!configured) throw new Error('missing-url');
  const base = new URL(configured);
  const local = ['localhost', '127.0.0.1'].includes(base.hostname);
  if (base.protocol !== 'https:' && !(local && base.protocol === 'http:')) throw new Error('invalid-protocol');
  base.pathname = pathname;
  base.search = '';
  base.hash = '';
  return base;
}

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true };
  if (!token) return { ok: false };
  try {
    const body = new URLSearchParams({ secret, response: String(token).slice(0, 2048) });
    if (ip && ip !== 'unknown') body.set('remoteip', ip);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await r.json().catch(() => ({}));
    return { ok: !!data.success };
  } catch {
    return { ok: false };
  }
}

module.exports = async function pair(req, res) {
  const { originHeader, allowed: origin } = resolveAllowedOrigin(req);

  if (originHeader && !origin) return sendJson(res, 403, { error: 'Origine refusée.' });

  if (req.method === 'OPTIONS') {
    if (!origin) return sendJson(res, 403, { error: 'Origine refusée.' });
    res.writeHead(204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
      'Vary': 'Origin',
    });
    return res.end();
  }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Méthode non autorisée.' }, origin);

  let payload;
  try { payload = await readPayload(req); } catch (error) {
    return sendJson(res, 400, { error: error.message === 'too-large' ? 'Requête trop volumineuse.' : 'Données invalides.' }, origin);
  }

  // Anti-spam: honeypot (champ "website") doit rester vide.
  if (typeof payload?.website === 'string' && payload.website.trim()) {
    return sendJson(res, 400, { error: 'Requête invalide.' }, origin);
  }

  const rawNumber = String(payload?.phone || payload?.number || '');
  const cleanPhone = rawNumber.replace(/\D/g, '');
  const consent = payload?.consent === true || payload?.consent === 'true';

  if (!/^\d{8,15}$/.test(cleanPhone)) {
    return sendJson(res, 400, { error: 'Numéro invalide. Saisis un numéro international de 8 à 15 chiffres.' }, origin);
  }
  if (!consent) {
    return sendJson(res, 400, { error: 'Le consentement au traitement des données est requis.' }, origin);
  }

  const ip = clientIp(req);
  if (overLimit(ip)) return sendJson(res, 429, { error: 'Trop de tentatives. Réessaie plus tard.' }, origin);

  const turnstile = await verifyTurnstile(payload?.turnstileToken, ip);
  if (!turnstile.ok) return sendJson(res, 400, { error: 'Vérification anti-spam échouée. Réessaie.' }, origin);

  let target;
  try { target = pairingApiUrl('/pair'); } catch {
    return sendJson(res, 503, { error: 'Service de jumelage indisponible pour le moment.' }, origin);
  }

  const apiToken = process.env.PAIRING_API_TOKEN;
  if (!apiToken) {
    return sendJson(res, 503, { error: 'Service de jumelage indisponible pour le moment.' }, origin);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json', 'x-api-token': apiToken };
    const response = await fetch(target, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone: cleanPhone,
        sessionId: `session_${cleanPhone}`
      }),
      cache: 'no-store',
      signal: controller.signal,
    });

    let body = {};
    try { body = await response.json(); } catch { body = {}; }

    if (response.status === 401) return sendJson(res, 503, { error: 'Service de jumelage indisponible pour le moment.' }, origin);
    if (response.status === 409) return sendJson(res, 409, { error: 'Une session est déjà enregistrée pour ce numéro.' }, origin);
    if (response.status === 429) return sendJson(res, 429, { error: 'Trop de tentatives. Réessaie plus tard.' }, origin);
    if (response.status === 400) return sendJson(res, 400, { error: body.error || 'Numéro invalide.' }, origin);
    if (!response.ok) return sendJson(res, 503, { error: body.error || 'Service de jumelage indisponible pour le moment.' }, origin);

    const code = String(body?.code || '').replace(/[\s-]+/g, '').toUpperCase();
    if (!code) return sendJson(res, 503, { error: 'Le serveur a répondu sans code valide.' }, origin);

    return sendJson(res, 200, { code }, origin);
  } catch {
    return sendJson(res, 503, { error: 'Service de jumelage indisponible pour le moment.' }, origin);
  } finally {
    clearTimeout(timer);
  }
};
