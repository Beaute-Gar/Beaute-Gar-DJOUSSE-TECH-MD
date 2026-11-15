'use strict';

function num(j) {
  return String(j || '').split('@')[0].split(':')[0];
}

const KEYS = ['id', 'lid', 'jid', 'phoneNumber', 'pn', 'participant', 'participantAlt', 'participantPn'];

// Tous les identifiants connus d'une personne (jid + lid), sous forme de numéros
function idsOf() {
  const out = new Set();
  for (const x of arguments) {
    if (!x) continue;
    if (typeof x === 'string') {
      const n = num(x);
      if (n) out.add(n);
    } else if (typeof x === 'object') {
      for (const k of KEYS) if (typeof x[k] === 'string' && x[k]) out.add(num(x[k]));
    }
  }
  return out;
}

function same(a, b) {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

function findParticipant(meta, set) {
  if (!meta || !Array.isArray(meta.participants)) return null;
  return meta.participants.find((p) => same(idsOf(p), set)) || null;
}

function isAdmin(p) {
  return !!p && (p.admin === 'admin' || p.admin === 'superadmin' || p.isAdmin === true || p.isSuperAdmin === true);
}

// Qui a écrit ce message (groupe ou privé)
function senderIds(sock, msg) {
  const k = (msg && msg.key) || {};
  if (k.fromMe) return idsOf(sock && sock.user);
  if (typeof k.remoteJid === 'string' && !k.remoteJid.endsWith('@g.us')) return idsOf(k.remoteJid, k.remoteJidAlt, k.participant, k.participantAlt);
  return idsOf(k.participant, k.participantAlt, msg && msg.participant);
}

// Meilleur identifiant pour écrire en privé à un participant (préférence : jid téléphone)
function dmJid(part, fallback) {
  const c = [];
  if (part) for (const k of ['id', 'jid', 'phoneNumber', 'pn', 'lid']) if (typeof part[k] === 'string' && part[k]) c.push(part[k]);
  if (fallback) c.push(fallback);
  const pn = c.find((x) => x.endsWith('@s.whatsapp.net'));
  if (pn) return pn;
  const raw = c.find((x) => /^\d+$/.test(x));
  if (raw) return raw + '@s.whatsapp.net';
  return c[0] || null;
}

module.exports = { num, idsOf, same, findParticipant, isAdmin, senderIds, dmJid };
