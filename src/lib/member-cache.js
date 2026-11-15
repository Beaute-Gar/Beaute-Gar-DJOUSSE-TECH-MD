'use strict';

/**
 * member-cache.js — retient le nom et le numero des membres de groupe.
 *
 * WhatsApp ne fournit pas toujours l'identite d'un membre au moment ou il
 * quitte le groupe. On garde donc en memoire (et sur disque) les noms deja
 * connus, pour que le message de depart reste lisible.
 */

const fs = require('fs');
const path = require('path');
const { normalizeJid } = require('./helpers');

const file = process.env.MEMBER_CACHE_FILE
  ? path.resolve(process.env.MEMBER_CACHE_FILE)
  : path.join(__dirname, '../../storage/database/member-names.json');

let cache = {};
let saveTimer = null;

function load() {
  try {
    if (fs.existsSync(file)) {
      cache = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
    }
  } catch (e) {
    cache = {};
  }
}

function flush() {
  saveTimer = null;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(cache, null, 2));
  } catch (e) {}
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(flush, 1500);
  if (saveTimer.unref) saveTimer.unref();
}

function put(jid, data) {
  const key = normalizeJid(jid);
  if (!key) return;

  const previous = cache[key] || {};
  const next = { ...previous };
  if (data.notify) next.notify = data.notify;
  if (data.name) next.name = data.name;
  next.updatedAt = Date.now();

  cache[key] = next;
  scheduleSave();
}

function rememberParticipant(participant) {
  if (!participant) return;

  const notify = participant.notify || participant.verifiedName || '';
  const name = participant.name || '';
  if (!notify && !name) return;

  const ids = [
    participant.id,
    participant.jid,
    participant.lid,
    participant.phoneNumber,
    participant.pn
  ];

  for (const id of ids) put(id, { notify, name });
}

function rememberMeta(meta) {
  for (const participant of (meta && meta.participants) || []) {
    rememberParticipant(participant);
  }
}

// Utilise le pushName des messages de groupe pour completer le cache.
function rememberMessage(m) {
  if (!m || !m.key) return;
  const chat = m.key.remoteJid;
  if (typeof chat !== 'string' || !chat.endsWith('@g.us')) return;

  const name = m.pushName || '';
  if (!name) return;

  const ids = [
    m.key.participant,
    m.key.participantPn,
    m.key.participantAlt,
    m.key.senderPn
  ].filter(Boolean);

  for (const id of ids) put(id, { notify: name });
}

function getMember(jid) {
  const key = normalizeJid(jid);
  if (!key) return {};
  return cache[key] || {};
}

function clear() {
  cache = {};
  scheduleSave();
}

load();

module.exports = {
  rememberParticipant,
  rememberMeta,
  rememberMessage,
  getMember,
  clear,
  file
};
