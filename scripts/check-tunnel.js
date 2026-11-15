#!/usr/bin/env node
'use strict';
const http = require('http');
const https = require('https');
const { URL } = require('url');
const url = process.argv[2] || 'https://[A_REMPLIR].ngrok-free.app/health';
if (url.includes('[A_REMPLIR]')) { console.error('Renseigner l\'URL ngrok.'); process.exit(2); }
const u = new URL(url);
const lib = u.protocol === 'https:' ? https : http;
const req = lib.request(u, { method: 'GET', headers: { 'ngrok-skip-browser-warning': '1' } }, (res) => {
  let b = ''; res.on('data', c => b += c); res.on('end', () => {
    console.log('status', res.statusCode); console.log(b);
    process.exit(res.statusCode >= 200 && res.statusCode < 300 ? 0 : 1);
  });
});
req.on('error', (e) => { console.error('erreur', e.message); process.exit(1); });
req.end();
