'use strict';

/* ─────────────── UTILITAIRES DE BASE ─────────────── */

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = [];
  if (d) p.push(`${d}j`);
  if (h) p.push(`${h}h`);
  if (m) p.push(`${m}m`);
  p.push(`${sec}s`);
  return p.join(' ');
}

function isGroup(jid) {
  return typeof jid === 'string' && jid.endsWith('@g.us');
}

// Extrait juste les chiffres d'un JID (enlève @s.whatsapp.net, @lid, suffixe :appareil, etc.)
function normalizeJid(jid) {
  if (!jid) return '';
  return String(jid)
    .replace(/:\d+(?=@)/, '')
    .replace(/_\d+(?=@)/, '')
    .replace('@c.us', '@s.whatsapp.net')
    .split('@')[0];
}

// Tous les identifiants connus d'un participant de groupe.
function participantIds(participant) {
  if (!participant) return [];
  return [participant.id, participant.lid, participant.jid, participant.phoneNumber, participant.pn]
    .map(normalizeJid)
    .filter(Boolean);
}

// Tous les identifiants connus du bot (numéro + LID).
function botIdentities(sock) {
  const user = (sock && sock.user) ? sock.user : {};
  return [user.id, user.lid, user.jid]
    .map(normalizeJid)
    .filter(Boolean);
}

/* ─────────────── GROUPES & ADMIN ─────────────── */

async function getGroupMeta(sock, jid) {
  if (!isGroup(jid)) return null;
  try { return await sock.groupMetadata(jid); }
  catch { return null; }
}

function isAdmin(meta, jid) {
  if (!meta || !jid || !meta.participants) return false;
  const target = normalizeJid(jid);
  if (!target) return false;

  const p = meta.participants.find(x => participantIds(x).includes(target));
  return p ? (p.admin === 'admin' || p.admin === 'superadmin') : false;
}

function botIsAdmin(meta, sock) {
  if (!meta || !meta.participants) return false;
  const ids = botIdentities(sock);
  if (!ids.length) return false;

  return meta.participants.some(p =>
    (p.admin === 'admin' || p.admin === 'superadmin') &&
    participantIds(p).some(id => ids.includes(id))
  );
}

// Accepte un socket (recommande) ou un JID pour compatibilite.
function isBotAdmin(meta, sockOrJid) {
  if (typeof sockOrJid === 'string' || !sockOrJid) return isAdmin(meta, sockOrJid);
  return botIsAdmin(meta, sockOrJid);
}

// Verifie si un JID correspond au bot, y compris via ses alias de groupe (LID/numero).
function isBot(meta, sock, jid) {
  const target = normalizeJid(jid);
  if (!target) return false;

  const ids = botIdentities(sock);
  if (ids.includes(target)) return true;

  const p = ((meta && meta.participants) || []).find(x => participantIds(x).includes(target));
  return !!(p && participantIds(p).some(id => ids.includes(id)));
}

/* ─────────────── MESSAGES & MENTIONS ─────────────── */

function getMentions(m) {
  return m?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
}

function getQuoted(m) {
  const ctx = m?.message?.extendedTextMessage?.contextInfo;
  return ctx?.participant || ctx?.quotedMessage?.participant || null;
}

function getTarget(m) {
  const mentions = getMentions(m);
  if (mentions.length) return mentions[0];
  const quoted = getQuoted(m);
  if (quoted) return quoted;
  return m.key.participant || m.key.remoteJid;
}

/* ─────────────── PROTECTIONS ─────────────── */

function isLink(text) {
  return /(https?:\/\/|wa\.me\/|chat\.whatsapp\.com\/|t\.me\/|www\.)/i.test(text || '');
}

function isSpam(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  const hasManyCaps = text.length > 15 && text.replace(/[^A-Z]/g, '').length / text.length > 0.7;
  const hasManyEmojis = (text.match(/[\u{1F300}-\u{1FAFF}]/gu) || []).length > 10;
  const hasRepeatedChars = /(.)\1{6,}/.test(lower);
  return hasManyCaps || hasManyEmojis || hasRepeatedChars;
}

function containsBadWord(text, badWords) {
  if (!text || !badWords || !badWords.length) return false;
  const lower = text.toLowerCase();
  return badWords.some(w => lower.includes(w.toLowerCase()));
}

/* ─────────────── EXPORTS ─────────────── */

module.exports = {
  formatUptime,
  isGroup,
  normalizeJid,
  getGroupMeta,
  isAdmin,
  isBotAdmin,
  isBot,
  botIdentities,
  participantIds,
  getMentions,
  getQuoted,
  getTarget,
  isLink,
  isSpam,
  containsBadWord
};
