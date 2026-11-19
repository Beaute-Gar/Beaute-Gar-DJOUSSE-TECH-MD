'use strict';
/* Point d'entree mobile (capacitor-nodejs 1.0.0-beta.9 / Node.js Mobile 18.20.4). */
process.env.MOBILE = '1';
process.env.NODE_ENV = 'production';

/* Journalisation immediate : on ecrit sur stdout avant toute autre chose,
   pour que logcat montre quelque chose meme si un require echoue. */
console.log('[mobile] ===== main.cjs demarre =====');
console.log('[mobile] process.version=' + process.version + ' platform=' + process.platform + ' arch=' + process.arch + ' pid=' + process.pid);
console.log('[mobile] __dirname=' + __dirname);
console.log('[mobile] cwd=' + process.cwd());
console.log('[mobile] DATADIR=' + (process.env.DATADIR || '(absent)'));

try {
  const dns = require('dns');
  if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');
  console.log('[mobile] dns ipv4first active');
} catch (e) { console.log('[mobile] dns indisponible : ' + e.message); }

try { if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto; } catch (e) { /* ignore */ }
console.log('[mobile] globalThis.crypto=' + (globalThis.crypto ? 'present' : 'ABSENT'));

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const rawLog = console.log.bind(console);
let channel;
let realBridge = false;
let bridgeApi = null;
try {
  bridgeApi = require('bridge');
  channel = bridgeApi.channel;
  realBridge = true;
  console.log('[mobile] bridge natif charge (channel=' + (channel ? 'ok' : 'ABSENT') + ', getDataPath=' + (typeof bridgeApi.getDataPath) + ')');
} catch (e) {
  console.log('[mobile] ATTENTION bridge indisponible (' + ((e && e.message) || e) + ') : mode test PC');
  channel = {
    send: function (ev, p) { if (ev !== 'bot:log') rawLog('[bridge->UI] ' + ev + ' ' + JSON.stringify(p)); },
    on: function () {},
    addListener: function () {}
  };
}

/* On journalise tous les evenements envoyes a l'interface. */
const rawSend = channel.send.bind(channel);
channel.send = function (ev, payload) {
  try {
    if (ev !== 'bot:log') console.log('[mobile] ->UI ' + ev + ' ' + JSON.stringify(payload));
  } catch (e) { /* ignore */ }
  return rawSend(ev, payload);
};

const runtime = require('./mobile-runtime.cjs');
runtime.init(channel);
console.log('[mobile] mobile-runtime charge');

// ---- Dossier de donnees prive (persiste aux mises a jour) ----
let bridgeData = null;
try { if (bridgeApi && typeof bridgeApi.getDataPath === 'function') bridgeData = bridgeApi.getDataPath(); } catch (e) {
  console.log('[mobile] getDataPath indisponible : ' + e.message);
}
const DATA = process.env.BOT_DATA_DIR ||
  (bridgeData ? path.join(bridgeData, 'djousse') :
    (process.env.DATADIR ? path.join(process.env.DATADIR, 'djousse') : path.join(__dirname, '..', '..', 'test-data')));

process.env.BOT_DATA_DIR = DATA;
console.log('[mobile] DATA=' + DATA);

['', 'storage', 'storage/sessions', 'storage/database', 'storage/backups', 'storage/logs', 'storage/downloads', 'vv', 'antidelete'].forEach(function (d) {
  try { fs.mkdirSync(path.join(DATA, d), { recursive: true }); } catch (e) { /* ignore */ }
});
function safeRm(p) {
  try {
    if (typeof fs.rmSync === 'function') fs.rmSync(p, { force: true });
    else if (fs.existsSync(p)) { if (fs.lstatSync(p).isDirectory()) fs.rmdirSync(p); else fs.unlinkSync(p); }
  } catch (e) { /* ignore */ }
}
safeRm(path.join(DATA, 'storage', 'bot.lock'));
safeRm(path.join(DATA, 'bot.lock'));

function ensureSecret() {
  const f = path.join(DATA, '.secret');
  try { return fs.readFileSync(f, 'utf8').trim(); }
  catch (e) {
    const s = crypto.randomBytes(32).toString('hex');
    try { fs.writeFileSync(f, s, { mode: 0o600 }); } catch (e2) { /* ignore */ }
    return s;
  }
}

process.env.MOBILE_SECRET = ensureSecret();
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'mobile.config.json'), 'utf8'));
  Object.keys(cfg).forEach(function (k) { if (process.env[k] === undefined) process.env[k] = String(cfg[k]); });
} catch (e) { /* pas de config */ }

// ---- Logs : memoire (300 lignes) + fichier (2 Mo max) + interface ----
const logs = [];
const LOG_FILE = path.join(DATA, 'storage', 'logs', 'mobile.log');
let inLog = false;
function fmt(a) {
  if (typeof a === 'string') return a;
  try { return a instanceof Error ? (a.stack || a.message) : JSON.stringify(a); } catch (e) { return String(a); }
}
['log', 'info', 'warn', 'error'].forEach(function (lvl) {
  const orig = console[lvl].bind(console);
  console[lvl] = function () {
    const args = Array.prototype.slice.call(arguments);
    if (!inLog) {
      inLog = true;
      try {
        const line = '[' + new Date().toISOString().slice(11, 19) + '] ' + args.map(fmt).join(' ');
        logs.push(line); if (logs.length > 300) logs.shift();
        try { rawSend('bot:log', { line: line }); } catch (e) { /* ignore */ }
        try {
          if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 2097152) fs.writeFileSync(LOG_FILE, '');
          fs.appendFileSync(LOG_FILE, line + '\n');
        } catch (e) { /* ignore */ }
      } catch (e) { /* ignore */ }
      inLog = false;
    }
    orig.apply(null, args);
  };
});

process.on('uncaughtException', function (e) { console.error('[uncaughtException]', (e && e.stack) || e); });
process.on('unhandledRejection', function (e) { console.error('[unhandledRejection]', (e && e.stack) || e); });
process.on('exit', function (code) { console.error('[mobile] process.exit reel, code=' + code); });
process.exit = function (code) {
  console.error('[mobile] process.exit(' + code + ') bloque : un process.exit tuerait toute l\'appli');
  runtime.setStatus('stopped', { code: code });
};

// Garde le event loop en vie meme sans socket (sinon le moteur Node se termine).
setInterval(function () { /* keepalive */ }, 2147483647);

// ---- Messages venant de l'interface ----
function on(ev, fn) {
  const reg = channel.on || channel.addListener;
  if (typeof reg === 'function') {
    reg.call(channel, ev, fn);
    console.log('[mobile] ecoute canal : ' + ev);
  } else {
    console.error('[mobile] impossible de ecouter ' + ev + ' : channel.on absent');
  }
}

on('pair:request', function (p) {
  console.log('[mobile] <-UI pair:request ' + JSON.stringify(p));
  const num = (p && p.number) || (p && p.args && p.args[0] && p.args[0].number) || (typeof p === 'string' ? p : '');
  runtime.requestPairing(num);
});
on('bot:status:get', function () {
  console.log('[mobile] <-UI bot:status:get');
  runtime.emitStatus();
});
on('bot:logs:get', function () {
  console.log('[mobile] <-UI bot:logs:get (' + logs.length + ' lignes)');
  rawSend('bot:logs', { lines: logs });
});
on('session:reset', function () {
  console.log('[mobile] <-UI session:reset');
  try {
    ['sessions', 'auth_info_baileys', 'auth'].forEach(function (d) {
      safeRmDir(path.join(DATA, 'storage', d));
      safeRmDir(path.join(DATA, d));
    });
    fs.mkdirSync(path.join(DATA, 'storage', 'sessions'), { recursive: true });
    rawSend('session:reset:done', {});
    runtime.setStatus('needs_pairing');
  } catch (e) { rawSend('pair:error', { message: 'Reinitialisation impossible : ' + e.message }); }
});

function safeRmDir(p) {
  try {
    if (typeof fs.rmSync === 'function') fs.rmSync(p, { recursive: true, force: true });
    else if (fs.existsSync(p)) fs.rmdirSync(p, { recursive: true });
  } catch (e) { /* ignore */ }
}

globalThis.__DJOUSSE_MOBILE__ = runtime;

console.log('[mobile] envoi node:ready');
rawSend('node:ready', { node: process.version, data: DATA, platform: process.platform, arch: process.arch });
runtime.setStatus('starting');

// ---- Baileys 7 est un module ESM : require() echoue sur Node 18 (ERR_REQUIRE_ESM) ----
// On le charge avec import() puis on le sert a tous les require('@whiskeysockets/baileys') du bot.
async function prepareBaileys() {
  const Module = require('module');
  try {
    require('@whiskeysockets/baileys');
    console.log('[mobile] Baileys charge via require (CommonJS)');
    return;
  } catch (e) {
    console.log('[mobile] require(Baileys) a echoue : code=' + (e && e.code) + ' message=' + ((e && e.message) || e));
    if (!e || e.code !== 'ERR_REQUIRE_ESM') { console.error('[mobile] Baileys illisible :', (e && e.stack) || e); throw e; }
  }
  console.log('[mobile] import() de Baileys en cours...');
  const ns = await import('@whiskeysockets/baileys');
  const origLoad = Module._load;
  Module._load = function (request) {
    if (request === '@whiskeysockets/baileys') return ns;
    return origLoad.apply(this, arguments);
  };
  console.log('[mobile] Baileys ESM charge via import() : default=' + (typeof ns.default) + ' exports=' + Object.keys(ns).length);
}

// ---- Demarrage du bot ----
console.log('[mobile] preparation de Baileys...');
prepareBaileys()
  .then(function () {
    console.log('[mobile] chargement de index.js...');
    return import(pathToFileURL(path.join(__dirname, 'index.js')).href);
  })
  .then(function () {
    console.log('[mobile] bot charge avec succes ; startSession=' + (typeof globalThis.__DJOUSSE_START_SESSION__));
    setTimeout(function () {
      if (runtime.getStatus() === 'starting' || runtime.getStatus() === 'idle') {
        runtime.setStatus('needs_pairing');
      }
    }, 1500);
  })
  .catch(function (e) {
    console.error('[mobile] ECHEC chargement du bot :', (e && e.stack) || e);
    runtime.setStatus('crashed', { message: String((e && e.message) || e) });
  });

// Test sur PC : $env:TEST_PAIR_NUMBER="237..." puis node main.cjs
if (!realBridge && process.env.TEST_PAIR_NUMBER) {
  setTimeout(function () { runtime.requestPairing(process.env.TEST_PAIR_NUMBER); }, 5000);
}
