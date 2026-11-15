'use strict';
/**
 * web/scripts/test-api.js — tests locaux des fonctions Vercel (aucun réseau).
 * Usage : node web/scripts/test-api.js
 */
const assert = require('node:assert');

let failures = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    failures++;
    console.error(`✗ ${name}\n    ${error.message}`);
  }
}

function mockReq({ method = 'GET', origin = 'https://site.test', url = '/', body = null } = {}) {
  const chunks = body ? [Buffer.from(JSON.stringify(body))] : [];
  return {
    method,
    url,
    headers: { host: 'site.test', 'x-forwarded-proto': 'https', 'x-real-ip': '203.0.113.7', ...(origin ? { origin } : {}) },
    body,
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

function mockRes() {
  const res = {
    statusCode: 0,
    headers: {},
    payload: null,
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers || {};
      return this;
    },
    end(raw) {
      if (raw) {
        try {
          this.payload = JSON.parse(raw);
        } catch {
          this.payload = raw;
        }
      }
      return this;
    },
  };
  return res;
}

function realFetch() {
  return globalThis.fetch;
}
function stubFetch(handler) {
  globalThis.fetch = async (target, options) => handler(target, options);
}

(async () => {
  const pair = require('../api/pair');
  const status = require('../api/status');

  // ── /api/pair ────────────────────────────────────────────────────────────
  await test('pair : refuse une origine étrangère', async () => {
    const res = mockRes();
    await pair(mockReq({ method: 'POST', origin: 'https://evil.test', body: { phone: '237600000000' } }), res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.headers['Access-Control-Allow-Origin'], undefined);
  });

  await test('pair : préflight accepté pour la bonne origine', async () => {
    const res = mockRes();
    await pair(mockReq({ method: 'OPTIONS' }), res);
    assert.strictEqual(res.statusCode, 204);
    assert.strictEqual(res.headers['Access-Control-Allow-Origin'], 'https://site.test');
    assert.ok(!String(res.headers['Access-Control-Allow-Headers']).includes('x-api-token'));
  });

  await test('pair : méthode GET refusée', async () => {
    const res = mockRes();
    await pair(mockReq({ method: 'GET' }), res);
    assert.strictEqual(res.statusCode, 405);
  });

  await test('pair : numéro invalide', async () => {
    const res = mockRes();
    await pair(mockReq({ method: 'POST', body: { phone: '12', consent: true } }), res);
    assert.strictEqual(res.statusCode, 400);
  });

  await test('pair : consentement requis', async () => {
    const res = mockRes();
    await pair(mockReq({ method: 'POST', body: { phone: '237600000000' } }), res);
    assert.strictEqual(res.statusCode, 400);
    assert.match(res.payload.error, /consentement/i);
  });

  await test('pair : jeton serveur absent → 503 générique', async () => {
    delete process.env.PAIRING_API_TOKEN;
    const res = mockRes();
    await pair(mockReq({ method: 'POST', body: { phone: '237600000000', consent: true } }), res);
    assert.strictEqual(res.statusCode, 503);
    assert.ok(!/PAIRING_API_TOKEN/.test(res.payload.error), 'le nom du secret ne doit pas fuiter');
  });

  await test('pair : code relayé et corps envoyés au service de jumelage', async () => {
    process.env.PAIRING_API_TOKEN = 'secret-test';
    process.env.PAIRING_API_URL = 'https://bot.test';
    let seen = null;
    stubFetch(async (target, options) => {
      seen = { url: String(target), body: JSON.parse(options.body), token: options.headers['x-api-token'] };
      return { ok: true, status: 200, json: async () => ({ code: 'abcd-1234' }) };
    });
    const res = mockRes();
    await pair(mockReq({ method: 'POST', body: { phone: '+237 600 000 000', consent: true } }), res);
    globalThis.fetch = realFetch();
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.payload, { code: 'ABCD1234' });
    assert.strictEqual(seen.url, 'https://bot.test/pair');
    assert.strictEqual(seen.body.phone, '237600000000');
    assert.strictEqual(seen.token, 'secret-test');
  });

  await test('pair : session déjà jumelée → 409', async () => {
    process.env.PAIRING_API_TOKEN = 'secret-test';
    stubFetch(async () => ({ ok: false, status: 409, json: async () => ({}) }));
    const res = mockRes();
    await pair(mockReq({ method: 'POST', body: { phone: '237600000000', consent: true } }), res);
    globalThis.fetch = realFetch();
    assert.strictEqual(res.statusCode, 409);
  });

  await test('pair : service injoignable → 503', async () => {
    process.env.PAIRING_API_TOKEN = 'secret-test';
    stubFetch(async () => {
      throw new Error('offline');
    });
    const res = mockRes();
    await pair(mockReq({ method: 'POST', body: { phone: '237600000000', consent: true } }), res);
    globalThis.fetch = realFetch();
    assert.strictEqual(res.statusCode, 503);
  });

  await test('pair : honeypot rempli → 400', async () => {
    const res = mockRes();
    await pair(mockReq({ method: 'POST', body: { phone: '237600000000', consent: true, website: 'http://spam.test' } }), res);
    assert.strictEqual(res.statusCode, 400);
  });

  // ── /api/status ──────────────────────────────────────────────────────────
  await test('status : refuse une origine étrangère', async () => {
    const res = mockRes();
    await status(mockReq({ origin: 'https://evil.test' }), res);
    assert.strictEqual(res.statusCode, 403);
  });

  await test('status : URL absente → 503', async () => {
    delete process.env.PAIRING_API_URL;
    const res = mockRes();
    await status(mockReq(), res);
    assert.strictEqual(res.statusCode, 503);
  });

  await test('status : état relayé sans identifiants ni numéros', async () => {
    process.env.PAIRING_API_URL = 'https://bot.test';
    process.env.PAIRING_API_TOKEN = 'secret-test';
    stubFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        connected: true,
        connection: 'open',
        sessions: 2,
        active: 1,
        ids: ['session_237600000000'],
        details: [{ id: 'session_237600000000', number: '237600000000', connected: true }],
      }),
    }));
    const res = mockRes();
    await status(mockReq(), res);
    globalThis.fetch = realFetch();
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.payload.connected, true);
    assert.strictEqual(res.payload.sessions, 2);
    const raw = JSON.stringify(res.payload);
    assert.ok(!raw.includes('237600000000'), 'un numéro ne doit pas être exposé');
    assert.ok(!('ids' in res.payload) && !('details' in res.payload), 'ids/details ne doivent pas être exposés');
  });

  delete process.env.PAIRING_API_TOKEN;
  delete process.env.PAIRING_API_URL;

  if (failures) {
    console.error(`\n${failures} test(s) en échec.`);
    process.exitCode = 1;
  } else {
    console.log('\n✅ Tous les tests des fonctions web passent.');
  }
})();
