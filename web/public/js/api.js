export class ApiError extends Error {
  constructor(message, status = 0, kind = 'unavailable') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.kind = kind;
  }
}

function apiBase() {
  const raw = typeof window !== 'undefined' && window.DJS_API_BASE ? String(window.DJS_API_BASE) : '';
  const base = raw.trim().replace(/\/$/, '');
  if (!base) return '';
  try {
    const u = new URL(base);
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(u.hostname);
    if (u.protocol !== 'https:' && !(isLocal && u.protocol === 'http:')) return '';
    return u.origin;
  } catch {
    return '';
  }
}

function buildUrl(path) {
  const base = apiBase();
  const p = String(path || '');
  if (/^https?:\/\//i.test(p)) return p; // interdit en usage normal; conservé pour compat interne
  const clean = '/' + p.replace(/^\/+/, '');
  return base ? base + clean : clean;
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
}

async function request(path, { method = 'GET', body, signal, retries } = {}) {
  const targetUrl = buildUrl(path);
  const base = apiBase();
  const maxRetries = typeof retries === 'number' ? retries : (typeof window !== 'undefined' && typeof window.DJS_API_RETRIES === 'number' ? window.DJS_API_RETRIES : 2);
  const timeoutMs = typeof window !== 'undefined' && window.DJS_API_TIMEOUT_MS ? Number(window.DJS_API_TIMEOUT_MS) : 12000;

  const headers = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': '1'
  };

  let attempt = 0;
  let lastError;
  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) { clearTimeout(timer); throw new DOMException('Aborted', 'AbortError'); }
      signal.addEventListener('abort', onAbort, { once: true });
    }
    try {
      const response = await fetch(targetUrl, {
        method,
        cache: 'no-store',
        headers,
        body: body ? JSON.stringify(body) : undefined,
        credentials: base ? 'include' : 'same-origin',
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);

      const contentType = response.headers.get('content-type') || '';
      let payload = {};
      if (contentType.includes('application/json')) {
        try { payload = await response.json(); } catch { payload = {}; }
      }

      if (!response.ok) {
        const kind = response.status === 401 || response.status === 403 ? 'unauthorized'
          : response.status === 409 ? 'session'
            : response.status === 429 ? 'rate-limit'
              : response.status >= 400 && response.status < 500 ? 'invalid'
                : 'unavailable';
        const message = payload && payload.error ? payload.error : (
          kind === 'rate-limit' ? 'Trop de tentatives. Patiente un instant avant de réessayer.'
            : kind === 'invalid' ? 'Requête invalide.'
              : 'Service momentanément indisponible. Réessaie dans quelques instants.'
        );
        if (response.status >= 500 && attempt < maxRetries) {
          attempt++;
          await wait(Math.min(500 * Math.pow(2, attempt - 1), 4000), signal);
          continue;
        }
        throw new ApiError(message, response.status, kind);
      }

      if (contentType && !contentType.includes('application/json')) {
        throw new ApiError('Service momentanément indisponible (réponse inattendue).', 0, 'unavailable');
      }
      return payload;
    } catch (error) {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      if (error?.name === 'AbortError' && signal?.aborted) throw error;
      lastError = error;
      const networkFail = error instanceof TypeError || error?.name === 'AbortError' || error?.message?.includes('fetch');
      if (networkFail && attempt < maxRetries) {
        attempt++;
        await wait(Math.min(600 * Math.pow(2, attempt - 1), 5000), signal);
        continue;
      }
      if (error instanceof ApiError) throw error;
      throw new ApiError('Service momentanément indisponible. Vérifie ta connexion ou réessaie plus tard (le tunnel peut être hors ligne).', 0, 'unavailable');
    }
  }
  if (lastError instanceof ApiError) throw lastError;
  throw new ApiError('Service momentanément indisponible. Réessaie plus tard.', 0, 'unavailable');
}

export function getStatus({ signal } = {}) {
  return request('/api/status', { method: 'GET', signal });
}

export async function getPairingCode(payloadOrNumber, { signal } = {}) {
  const body = (payloadOrNumber && typeof payloadOrNumber === 'object')
    ? { ...payloadOrNumber }
    : { phone: String(payloadOrNumber || '').replace(/\D/g, '') };
  if (body.phone) body.phone = String(body.phone).replace(/\D/g, '');
  if (body.number && !body.phone) { body.phone = String(body.number).replace(/\D/g, ''); delete body.number; }

  const result = await request('/api/pair', { method: 'POST', body, signal });
  const code = String(result?.code || '').replace(/[\s-]+/g, '').toUpperCase();
  if (!code) throw new ApiError('Le serveur a répondu sans code de jumelage valide.', 0, 'unavailable');
  return { code, raw: result };
}
