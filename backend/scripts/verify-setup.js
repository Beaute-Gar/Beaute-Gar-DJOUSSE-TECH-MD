#!/usr/bin/env node
'use strict';
/**
 * verify-setup.js — contrôles de base du backend local (sans privilèges admin).
 * Usage: node backend/scripts/verify-setup.js [--url=http://127.0.0.1:3001] [--origin=https://[A_REMPLIR].vercel.app]
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
}));
const base = args.url || `http://127.0.0.1:${process.env.PORT || 3001}`;
const origin = args.origin || 'https://[A_REMPLIR].vercel.app';
const badOrigin = 'https://evil.example.invalid';

function req(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const r = lib.request(u, { method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

(async () => {
  let ok = 0, fail = 0;
  const check = async (name, fn) => {
    try { await fn(); console.log('✓', name); ok++; }
    catch (e) { console.error('✗', name, '-', e.message); fail++; }
  };

  await check('GET /health répond 200', async () => {
    const r = await req(base + '/health');
    if (r.status !== 200) throw new Error('status ' + r.status);
    const j = JSON.parse(r.body);
    if (j.ok !== true) throw new Error('corps inattendu');
  });

  await check('CORS refusé pour origine inconnue', async () => {
    const r = await req(base + '/health', { headers: { Origin: badOrigin } });
    const acao = r.headers['access-control-allow-origin'];
    if (acao === badOrigin || acao === '*') throw new Error('origine inconnue acceptée');
    if (r.status !== 403 && r.status !== 200) throw new Error('status inattendu ' + r.status);
  });

  await check('CORS accepté pour origine autorisée (si configurée)', async () => {
    if (origin.includes('[A_REMPLIR]')) { console.log('  (ignoré: origine [A_REMPLIR])'); return; }
    const r = await req(base + '/health', { headers: { Origin: origin } });
    if (r.headers['access-control-allow-origin'] !== origin) throw new Error('origine autorisée refusée');
  });

  await check('Route protégée sans token → 401/403', async () => {
    const r = await req(base + '/api/me');
    if (![401, 403].includes(r.status)) throw new Error('attendu 401/403, obtenu ' + r.status);
  });

  await check('En-tête ngrok-skip-browser-warning accepté en CORS (preflight)', async () => {
    if (origin.includes('[A_REMPLIR]')) { console.log('  (ignoré: origine [A_REMPLIR])'); return; }
    const r = await req(base + '/health', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'ngrok-skip-browser-warning,authorization,content-type' } });
    if (![200, 204].includes(r.status)) throw new Error('preflight refusé ' + r.status);
  });

  console.log(`\nRésultat: ${ok} ok, ${fail} échec(s).`);
  if (fail) process.exitCode = 1;
})().catch((e) => { console.error('Erreur:', e.message); process.exit(1); });
