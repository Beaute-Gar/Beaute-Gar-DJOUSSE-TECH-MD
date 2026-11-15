'use strict';

// Extrait la partie numérique d'un identifiant WhatsApp (jid ou lid)
function num(j) {
  return String(j || '').split('@')[0].split(':')[0];
}

const KEYS = ['id', 'lid', 'jid', 'phoneNumber', 'pn', 'participant', 'participantAlt', 'participantPn'];

// Rassemble tous les identifiants connus d'une personne (compatible jid + lid)
function idsOf() {
  const out = new Set();
  for (const x of arguments) {
    if (!x) continue;
    if (typeof x === 'string') {
      const n = num(x);
      if (n) out.add(n);
    } else if (typeof x === 'object') {
      for (const k of KEYS) {
        if (typeof x[k] === 'string' && x[k]) out.add(num(x[k]));
      }
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

function senderIds(sock, msg) {
  if (msg.key && msg.key.fromMe) return idsOf(sock.user);
  return idsOf(msg.key && msg.key.participant, msg.key && msg.key.participantAlt, msg.participant);
}

module.exports = { num, idsOf, same, findParticipant, isAdmin, senderIds };
