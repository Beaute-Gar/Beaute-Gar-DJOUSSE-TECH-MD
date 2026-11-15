'use strict';

/**
 * MODE NUIT — ferme automatiquement le groupe à une heure et le rouvre le matin.
 *
 * Commandes (admins) :
 *   .modenuit 22:00 06:00 [fuseau]   active (ex : .modenuit 22h 6h Africa/Douala)
 *   .modenuit off | on               désactive / réactive
 *   .modenuit                        affiche l'état
 */
const ids = require('../jeux/commun/ids');
const store = require('../jeux/commun/store');
const busy = require('../jeux/commun/busy');
const groupOwner = require('../core/group-owner');
const { extractText, decorate } = require('../jeux/commun/text');

const PREFIX = process.env.PREFIX || '.';
const DEFAULT_TZ = process.env.NIGHT_TZ || 'Africa/Douala';
const TICK_MS = parseInt(process.env.NIGHT_TICK_MS, 10) || 30000;
const RETRY_MS = 10 * 60 * 1000;

// Plusieurs sessions tournent dans le même processus : on garde un socket par session.
const sockets = new Map(); // session -> sock
let timer = null;

const cfgs = () => store.get('modenuit', {});

function register(sock) {
  const key = groupOwner.sessionOf(sock);
  if (key) sockets.set(key, sock);
  return key;
}

/** Socket de la session qui possède le groupe (aucune autre session n'agit à sa place). */
function socketFor(chatId) {
  const owner = groupOwner.ownerOf(chatId);
  if (owner && groupOwner.isUsable(owner)) return sockets.get(owner) || null;
  // Propriétaire disparu : une session active peut agir, sans changer le registre.
  for (const sock of sockets.values()) return sock;
  return null;
}

function stopSession(sessionId) {
  const key = String(sessionId || '').split('@')[0].split(':')[0];
  if (key) sockets.delete(key);
}

/* ---------- heures ---------- */

function parseHM(s) {
  const m = String(s || '').trim().toLowerCase().match(/^(\d{1,2})(?:[:h](\d{2})?)?$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

const fmt = (mins) => String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');

function validTz(tz) {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return true;
  } catch (_) {
    return false;
  }
}

function minutesNow(tz) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const h = parseInt(parts.find((p) => p.type === 'hour').value, 10) % 24;
  const m = parseInt(parts.find((p) => p.type === 'minute').value, 10);
  return h * 60 + m;
}

function inWindow(now, start, end) {
  if (start === end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

/* ---------- application ---------- */

async function say(sock, chatId, text) {
  if (!sock) return;
  try {
    await sock.sendMessage(chatId, { text: decorate(text) });
  } catch (e) {
    console.error('[modenuit] envoi impossible:', e.message);
  }
}

async function evaluate(chatId, c, nowMin) {
  if (!c.enabled || busy.isBusy(chatId)) return;
  const sock = socketFor(chatId);
  if (!sock) return;
  const wantClosed = inWindow(nowMin !== undefined ? nowMin : minutesNow(c.tz), c.start, c.end);
  const want = wantClosed ? 'closed' : 'open';
  if (c.applied === want) return;
  if (c.failAt && Date.now() - c.failAt < RETRY_MS) return;

  // Premier passage en journée : on ne rouvre pas un groupe fermé volontairement par les admins
  if (!c.applied && want === 'open') {
    c.applied = 'open';
    store.save('modenuit');
    return;
  }
  try {
    await sock.groupSettingUpdate(chatId, wantClosed ? 'announcement' : 'not_announcement');
    c.applied = want;
    c.failAt = 0;
    store.save('modenuit');
    await say(sock, chatId, wantClosed
      ? '🌙 *Mode nuit activé.* Le groupe est fermé jusqu\'à ' + fmt(c.end) + '. Bonne nuit à tous !'
      : '☀️ *Bonjour !* Le groupe est rouvert. Belle journée à tous !');
  } catch (e) {
    c.failAt = Date.now();
    store.save('modenuit');
    console.error('[modenuit] impossible de modifier le groupe ' + chatId + ' (le bot est-il admin ?):', e.message);
  }
}

async function tick(nowMin) {
  const all = cfgs();
  for (const chatId of Object.keys(all)) {
    try {
      await evaluate(chatId, all[chatId], nowMin);
    } catch (e) {
      console.error('[modenuit] erreur:', e && e.message);
    }
  }
}

function start(sock) {
  if (sock) register(sock);
  if (timer) return;
  timer = setInterval(() => tick().catch(() => {}), TICK_MS);
  if (timer.unref) timer.unref();
}

/* ---------- commandes ---------- */

async function reply(sock, msg, text) {
  try {
    await sock.sendMessage(msg.key.remoteJid, { text: decorate(text) }, { quoted: msg });
  } catch (e) {
    console.error('[modenuit] réponse impossible:', e.message);
  }
}

function statusText(c) {
  if (!c) return '🌙 *Mode nuit* : non configuré.\nExemple : *' + PREFIX + 'modenuit 22:00 06:00*';
  return '🌙 *Mode nuit* : ' + (c.enabled ? '✅ activé' : '⏸️ désactivé') + '\nFermeture : *' + fmt(c.start) + '* — Ouverture : *' + fmt(c.end) + '*\nFuseau : ' + c.tz +
    '\nHeure actuelle (fuseau du groupe) : ' + fmt(minutesNow(c.tz));
}

async function handleCommand(sock, msg, args) {
  const chatId = msg.key.remoteJid;
  let meta;
  try {
    meta = await sock.groupMetadata(chatId);
  } catch (_) {
    return reply(sock, msg, '❌ Impossible de lire les infos du groupe.');
  }
  if (!ids.isAdmin(ids.findParticipant(meta, ids.senderIds(sock, msg)))) return reply(sock, msg, '🔒 Seuls les admins peuvent gérer le mode nuit.');

  const all = cfgs();
  const c = all[chatId];
  const first = (args[0] || '').toLowerCase();

  if (!first || first === 'status' || first === 'statut') return reply(sock, msg, statusText(c));

  if (first === 'off' || first === 'stop' || first === 'desactiver') {
    if (!c) return reply(sock, msg, statusText(null));
    c.enabled = false;
    // si le groupe est fermé par le mode nuit, on le rouvre
    if (c.applied === 'closed') {
      try { await sock.groupSettingUpdate(chatId, 'not_announcement'); } catch (_) { /* ignoré */ }
    }
    c.applied = 'open';
    store.save('modenuit');
    return reply(sock, msg, '⏸️ Mode nuit désactivé.');
  }

  if (first === 'on' || first === 'activer') {
    if (!c) return reply(sock, msg, statusText(null));
    c.enabled = true;
    c.applied = undefined;
    store.save('modenuit');
    start(sock);
    await evaluate(chatId, c);
    return reply(sock, msg, statusText(c));
  }

  const startMin = parseHM(args[0]);
  const endMin = parseHM(args[1]);
  if (startMin === null || endMin === null || startMin === endMin) {
    return reply(sock, msg, '❓ Utilisation : *' + PREFIX + 'modenuit 22:00 06:00 [fuseau]*\nExemples : ' + PREFIX + 'modenuit 22h 6h  |  ' + PREFIX + 'modenuit 23:30 05:00 Africa/Douala\n(*off* pour désactiver)');
  }
  const tz = args[2] || DEFAULT_TZ;
  if (!validTz(tz)) return reply(sock, msg, '❓ Fuseau horaire inconnu : ' + tz + '. Exemple : Africa/Douala, America/Toronto, Europe/Paris.');

  const botP = ids.findParticipant(meta, ids.idsOf(sock.user));
  all[chatId] = { enabled: true, start: startMin, end: endMin, tz, applied: undefined, failAt: 0 };
  store.save('modenuit');
  start(sock);
  await reply(sock, msg,
    statusText(all[chatId]) + (ids.isAdmin(botP) ? '' : '\n\n⚠️ Je ne suis pas admin du groupe : je ne pourrai ni fermer ni rouvrir le groupe. Fais-moi admin.'));
  await evaluate(chatId, all[chatId]);
}

async function handleMessage(sock, msg) {
  try {
    const chatId = msg && msg.key && msg.key.remoteJid;
    if (!chatId || !chatId.endsWith('@g.us') || !msg.message) return false;
    if (sock) register(sock);

    // Une seule session gère le groupe : les autres ne touchent pas au mode nuit.
    const me = groupOwner.sessionOf(sock);
    const owner = groupOwner.ownerOf(chatId);
    if (owner && me && owner !== me) return false;

    const text = extractText(msg);
    if (!text.startsWith(PREFIX)) return false;
    const w = text.slice(PREFIX.length).trim().split(/\s+/);
    const name = (w[0] || '').toLowerCase();
    if (name !== 'modenuit' && name !== 'nightmode' && name !== 'nuit') return false;
    start(sock);
    await handleCommand(sock, msg, w.slice(1));
    return true;
  } catch (e) {
    console.error('[modenuit] erreur:', e && e.stack ? e.stack : e);
    return false;
  }
}

module.exports = { handleMessage, start, stopSession, tick, parseHM, inWindow, _cfgs: cfgs };
