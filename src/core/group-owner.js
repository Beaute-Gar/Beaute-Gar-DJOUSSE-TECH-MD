'use strict';

/**
 * group-owner.js — un seul bot (session) responsable de chaque groupe.
 *
 * Probleme resolu : plusieurs comptes WhatsApp du bot peuvent etre membres du
 * meme groupe. Chaque compte recoit les memes messages et repondrait sinon en
 * double. Ici, le premier bot autorise revendique le groupe ; les autres
 * ignorent totalement ce groupe (commandes, protections, bienvenue, lecture).
 *
 * Regles :
 *  - une session = un compte WhatsApp, identifie par son numero (sock.user.id) ;
 *  - le registre est persistant (storage/database/group-ownership.json) ;
 *  - un bot admin du groupe est prioritaire pour la revendication ;
 *  - si le proprietaire disparait, un bot admin peut reprendre (apres delai) ;
 *  - `.claim <numero>` permet a un admin du groupe de transferer explicitement.
 */

const fs = require('fs');
const path = require('path');
const db = require('../lib/database');
const paths = require('../config/paths');
const style = require('../config/style');
const config = require('../config/config');
const { extractText } = require('../lib/message');
const {
  normalizeJid,
  isBotAdmin,
  isAdmin,
  getGroupMeta,
  participantIds
} = require('../lib/helpers');

const FILE = process.env.GROUP_OWNER_FILE || 'group-ownership';
const BOOT_AT = Date.now();

const GRACE_MS = Math.max(0, Number(process.env.GROUP_OWNER_GRACE_MS) || 10 * 60 * 1000);
const STARTUP_GRACE_MS = Math.max(0, Number(process.env.GROUP_OWNER_STARTUP_MS) || 90 * 1000);
const META_TTL_MS = Math.max(0, Number(process.env.GROUP_OWNER_META_TTL_MS) || 5 * 60 * 1000);

let cache = null;
const downAt = new Map();
const metaCache = new Map();

let runtime = {
  isAlive: () => false,
  listActive: () => []
};

/* ------------------------------ registre ------------------------------ */

function load() {
  if (cache) return cache;
  const data = db.get(FILE) || {};
  cache = data && typeof data === 'object' && data.groups ? data : { groups: {} };
  if (!cache.groups || typeof cache.groups !== 'object') cache.groups = {};
  return cache;
}

function save() {
  try {
    db.set(FILE, cache);
  } catch (e) {
    console.error('[group-owner] registre non sauvegarde :', e.message);
  }
}

function sessionOf(sock) {
  const id = sock && sock.user && (sock.user.id || sock.user.jid);
  return normalizeJid(id);
}

function ownerOf(groupId) {
  const entry = load().groups[groupId];
  return entry && entry.session ? entry.session : null;
}

function entryOf(groupId) {
  return load().groups[groupId] || null;
}

function sessionExists(session) {
  try {
    return fs.existsSync(path.join(paths.sessions, session, 'creds.json'));
  } catch (_) {
    return false;
  }
}

/** Une session est utilisable si elle est connectee, ou si elle vient de tomber. */
function isUsable(session) {
  if (!session) return false;
  if (runtime.isAlive(session)) return true;
  // Dossier supprime : la session n'existe plus, on peut reprendre tout de suite.
  if (!sessionExists(session)) return false;
  // Au demarrage, les sessions se connectent les unes apres les autres.
  if (Date.now() - BOOT_AT < STARTUP_GRACE_MS) return true;
  const since = downAt.get(session);
  return !!since && Date.now() - since < GRACE_MS;
}

/* ------------------------------ runtime ------------------------------ */

function setRuntime(hooks) {
  if (!hooks) return;
  if (typeof hooks.isAlive === 'function') runtime.isAlive = hooks.isAlive;
  if (typeof hooks.listActive === 'function') runtime.listActive = hooks.listActive;
}

function markUp(session) {
  if (session) downAt.delete(session);
}

function markDown(session) {
  if (session) downAt.set(session, Date.now());
}

/* ------------------------------ helpers ------------------------------ */

function isBotOwner(jid) {
  const sender = normalizeJid(jid);
  if (!sender) return false;
  const owner = normalizeJid(config.ownerNumber) || normalizeJid(db.getSetting('ownerNumber', ''));
  return !!owner && sender === owner;
}

async function metaOf(sock, groupId) {
  const key = sessionOf(sock) + '|' + groupId;
  const hit = metaCache.get(key);
  if (hit && Date.now() - hit.at < META_TTL_MS) return hit.value;

  const meta = await getGroupMeta(sock, groupId);
  metaCache.set(key, { at: Date.now(), value: meta });
  return meta;
}

function invalidateMeta(groupId) {
  for (const key of metaCache.keys()) {
    if (key.endsWith('|' + groupId)) metaCache.delete(key);
  }
}

/** Un autre bot actif est-il admin de ce groupe ? */
function anotherAdminBot(meta, me) {
  const active = new Set(runtime.listActive().map(normalizeJid));
  active.delete(me);
  if (!active.size) return false;

  return (meta.participants || []).some((p) => {
    if (!(p.admin === 'admin' || p.admin === 'superadmin')) return false;
    return participantIds(p).some((id) => active.has(id));
  });
}

/**
 * Le groupe contient-il plusieurs sessions actives du bot ?
 * Dans ce cas, chaque session ne traite que les messages de son propre compte.
 */
async function isMultiSession(sock, groupId) {
  const meta = await metaOf(sock, groupId);
  if (!meta || !Array.isArray(meta.participants)) return false;

  const active = new Set(runtime.listActive().map(normalizeJid));
  if (active.size < 2) return false;

  let count = 0;
  for (const p of meta.participants) {
    if (participantIds(p).some((id) => active.has(id))) {
      count += 1;
      if (count >= 2) return true;
    }
  }
  return false;
}

/**
 * Ce bot peut-il revendiquer le groupe ?
 *  - oui s'il est admin ;
 *  - oui si aucun autre bot actif n'est admin (sinon le groupe resterait mort).
 */
async function canClaim(sock, groupId) {
  const meta = await metaOf(sock, groupId);
  if (!meta) return false;
  const me = sessionOf(sock);
  if (isBotAdmin(meta, sock)) return true;
  return !anotherAdminBot(meta, me);
}

/* ------------------------------ operations ------------------------------ */

function claim(groupId, session, opts = {}) {
  const g = load().groups;
  const current = g[groupId];
  if (current && current.session && !opts.force) return current.session;

  const now = Date.now();
  g[groupId] = {
    session,
    since: current && current.session === session && current.since ? current.since : now,
    updatedAt: now
  };
  save();

  const label = !current ? 'attribution' : (current.session === session ? 'confirmation' : 'transfert');
  console.log('[group-owner] ' + label + ' ' + groupId + ' -> ' + session + (opts.reason ? ' (' + opts.reason + ')' : ''));
  return session;
}

function release(groupId, reason) {
  const g = load().groups;
  const current = g[groupId];
  if (!current) return false;
  delete g[groupId];
  save();
  console.log('[group-owner] liberation ' + groupId + ' (session ' + current.session + ')' + (reason ? ' : ' + reason : ''));
  return true;
}

function releaseSession(session, reason) {
  const target = normalizeJid(session);
  if (!target) return [];
  const g = load().groups;
  const groups = [];
  for (const groupId of Object.keys(g)) {
    if (g[groupId] && g[groupId].session === target) {
      delete g[groupId];
      groups.push(groupId);
    }
  }
  if (groups.length) {
    save();
    console.log('[group-owner] ' + groups.length + ' groupe(s) libere(s) pour ' + target + (reason ? ' : ' + reason : ''));
  }
  return groups;
}

/* ------------------------------ routage ------------------------------ */

/**
 * Un message de groupe doit-il etre traite par cette session ?
 * 'process'  : oui (et revendication eventuelle)
 * 'ignore'   : non, une autre session s'en occupe
 * 'consumed' : message traite ici (.claim), ne pas continuer
 */
async function route(sock, m, groupId) {
  const me = sessionOf(sock);
  if (!me) return 'ignore';

  const text = extractText(m);
  const claimCmd = parseClaim(text);
  const owner = ownerOf(groupId);
  const ownerUsable = owner ? isUsable(owner) : false;

  if (claimCmd) {
    return handleClaim(sock, m, groupId, me, claimCmd.target, owner, ownerUsable);
  }

  if (ownerUsable) {
    return owner === me ? 'process' : 'ignore';
  }

  // Groupe orphelin (jamais attribue, ou proprietaire disparu).
  if (!(await canClaim(sock, groupId))) return 'ignore';

  claim(groupId, me, {
    force: !!owner,
    reason: owner ? 'reprise-automatique' : 'premiere-prise'
  });

  // Course possible entre plusieurs sessions : seule la gagnante traite.
  return ownerOf(groupId) === me ? 'process' : 'ignore';
}

/** Version sans revendication, pour la mise en cache / anti-delete / statuts. */
function canRead(sock, groupId) {
  const owner = ownerOf(groupId);
  if (!owner) return true;
  if (!isUsable(owner)) return true;
  return owner === sessionOf(sock);
}

/** Evenements de groupe (bienvenue, depart, protections). */
async function ensureForEvent(sock, groupId) {
  const me = sessionOf(sock);
  if (!me) return false;

  const owner = ownerOf(groupId);
  if (owner && isUsable(owner)) return owner === me;

  if (!(await canClaim(sock, groupId))) return false;

  claim(groupId, me, {
    force: !!owner,
    reason: owner ? 'reprise-evenement' : 'evenement-groupe'
  });
  return ownerOf(groupId) === me;
}

/* ------------------------------ .claim ------------------------------ */

function parseClaim(text) {
  const t = String(text || '').trim();
  if (!t.startsWith(config.prefix)) return null;

  const parts = t.slice(config.prefix.length).trim().split(/\s+/);
  if ((parts[0] || '').toLowerCase() !== 'claim') return null;

  return { target: (parts[1] || '').replace(/\D/g, '') || null };
}

function activeSessions() {
  return runtime.listActive().map(normalizeJid).filter(Boolean).sort();
}

async function reply(sock, groupId, text, quoted) {
  try {
    await sock.sendMessage(groupId, { text }, quoted ? { quoted } : undefined);
  } catch (_) { /* ignore */ }
}

async function handleClaim(sock, m, groupId, me, target, owner, ownerUsable) {
  const sender = m.key.participant || m.key.remoteJid;
  const meta = await metaOf(sock, groupId);
  const allowed = !!(m.key.fromMe || isAdmin(meta, sender) || isBotOwner(sender));

  if (!allowed) return 'ignore';

  // Cible explicite : seule la session ciblee agit.
  if (target && target !== me) {
    // La session proprietaire peut signaler une cible inexistante, sans doublon.
    if (ownerUsable && owner === me && !runtime.isAlive(target)) {
      await reply(sock, groupId, style.renderError([
        'Session ' + target + ' inactive.',
        'Sessions actives : ' + (activeSessions().join(', ') || 'aucune')
      ]), m);
      return 'consumed';
    }
    return 'ignore';
  }

  if (!target) {
    // Affichage : seul le proprietaire (ou un bot admin si orphelin) repond.
    if (ownerUsable && owner !== me) return 'ignore';
    if (!ownerUsable && !(await canClaim(sock, groupId))) return 'ignore';

    const entry = entryOf(groupId);
    await reply(sock, groupId, style.renderInfo([
      'Proprietaire : ' + (owner || 'aucun'),
      'Depuis : ' + (entry && entry.since ? new Date(entry.since).toLocaleString('fr-FR') : '-'),
      'Sessions actives : ' + (activeSessions().join(', ') || 'aucune'),
      'Transfert : ' + config.prefix + 'claim <numero>'
    ]), m);
    return 'consumed';
  }

  // target === me : on prend le controle.
  if (!runtime.isAlive(me)) {
    await reply(sock, groupId, style.renderError(['Cette session n\'est pas active.']), m);
    return 'consumed';
  }

  if (gameActive(groupId)) {
    await reply(sock, groupId, style.renderError([
      'Une partie est en cours dans ce groupe.',
      'Terminez-la avant de transferer le controle.'
    ]), m);
    return 'consumed';
  }

  claim(groupId, me, { force: true, reason: 'claim-manuel' });
  invalidateMeta(groupId);
  console.log('[group-owner] claim manuel ' + groupId + ' -> ' + me + ' par ' + normalizeJid(sender));
  await reply(sock, groupId, style.renderSuccess([
    'Controle du groupe transfere a la session ' + me + '.'
  ]), m);
  return 'consumed';
}

function gameActive(groupId) {
  const checks = [
    () => require('../jeux/actionverite')._games.has(groupId),
    () => require('../jeux/quiz')._games.has(groupId),
    () => require('../jeux/loupgarou')._games.has(groupId)
  ];
  return checks.some((fn) => {
    try {
      return fn();
    } catch (_) {
      return false;
    }
  });
}

module.exports = {
  sessionOf,
  ownerOf,
  entryOf,
  claim,
  release,
  releaseSession,
  route,
  canRead,
  ensureForEvent,
  isMultiSession,
  isUsable,
  setRuntime,
  markUp,
  markDown,
  invalidateMeta,
  // pour les tests
  _reset: () => {
    cache = null;
    downAt.clear();
    metaCache.clear();
  }
};
