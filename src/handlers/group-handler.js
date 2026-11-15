'use strict';
const style = require('../config/style');
const config = require('../config/config');
const db = require('../lib/database');
const {
  isGroup,
  getGroupMeta,
  normalizeJid,
  participantIds,
  isBot
} = require('../lib/helpers');
const { handleGroupJoin, wasKickedByGuard } = require('./protection-handler');
const groupOwner = require('../core/group-owner');
const { phoneOf, normalizePhone } = require('../lib/phone');
const {
  rememberParticipant,
  rememberMeta,
  getMember
} = require('../lib/member-cache');

// Evite les doublons quand WhatsApp renvoie deux fois le meme evenement.
const eventSeen = new Map();
const DEDUPE_MS = 20000;

function seenRecently(key) {
  const now = Date.now();
  const last = eventSeen.get(key);
  if (last && now - last < DEDUPE_MS) return true;

  eventSeen.set(key, now);
  if (eventSeen.size > 1000) {
    for (const [k, v] of eventSeen) {
      if (now - v > 60000) eventSeen.delete(k);
    }
  }
  return false;
}

function findParticipant(meta, jid) {
  const target = normalizeJid(jid);
  if (!target) return null;
  return (meta.participants || []).find((p) => participantIds(p).includes(target)) || null;
}

// Un depart volontaire a author = le membre lui-meme (parfois sous une autre forme : LID / numero).
function isSelfActor(jid, participant, author) {
  if (!author) return true;
  const actor = normalizeJid(author);
  const selfIds = [normalizeJid(jid), ...participantIds(participant)];
  return selfIds.includes(actor);
}

function ordinal(number) {
  return number === 1 ? '1er' : `${number}e`;
}

function formatDate(date = new Date()) {
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function formatTime(date = new Date()) {
  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatCreation(ts) {
  if (!ts) return '';
  const d = new Date(Number(ts) * 1000);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

function buildIdentity(sock, meta, jid, participant) {
  const found = findParticipant(meta, jid);
  const cached = getMember(jid) || {};
  const phoneDigits = phoneOf(
    sock,
    meta,
    jid,
    participant && participant.phoneNumber,
    participant && participant.pn,
    participant && participant.lid
  );

  let phoneDisplay = 'Numéro masqué';
  let country = '';

  if (phoneDigits) {
    const parsed = normalizePhone('+' + phoneDigits);
    if (parsed.ok) {
      phoneDisplay = parsed.formatted;
      country = parsed.country || '';
    } else {
      phoneDisplay = '+' + phoneDigits;
    }
  }

  const notify =
    (found && (found.notify || found.verifiedName)) ||
    (participant && (participant.notify || participant.verifiedName)) ||
    cached.notify ||
    '';
  const savedName =
    (found && found.name) ||
    (participant && participant.name) ||
    cached.name ||
    '';
  const accountName = notify || savedName || 'Non renseigné';
  const registeredName = savedName && savedName !== accountName ? savedName : '';

  return {
    phoneDigits: phoneDigits || normalizeJid(jid),
    phoneDisplay,
    country,
    accountName,
    registeredName
  };
}

async function getAvatar(sock, jid) {
  try {
    const url = await sock.profilePictureUrl(jid, 'image');
    return url || null;
  } catch (e) {
    return null;
  }
}

async function sendPresentation(sock, groupId, jid, caption, extraMentions = []) {
  const avatar = await getAvatar(sock, jid);
  const mentions = [...new Set([jid, ...extraMentions].filter(Boolean))];

  if (avatar) {
    try {
      await sock.sendMessage(groupId, {
        image: { url: avatar },
        caption,
        mentions
      });
      return;
    } catch (e) {
      // Si l'image echoue, on envoie au moins le texte.
    }
  }

  await sock.sendMessage(groupId, { text: caption, mentions });
}

function welcomeCaption(sock, meta, jid, participant, position, memberCount) {
  const identity = buildIdentity(sock, meta, jid, participant);
  const subject = meta.subject || 'le groupe';
  const adminCount = (meta.participants || []).filter(
    (p) => p.admin === 'admin' || p.admin === 'superadmin'
  ).length;
  const desc = String(meta.desc || '').replace(/\s+/g, ' ').trim();
  const created = formatCreation(meta.creation);

  const lines = [
    `👋 Salut @${identity.phoneDigits} !`,
    `👤 Nom du compte : ${identity.accountName}`,
    identity.registeredName ? `📇 Enregistré sous : ${identity.registeredName}` : null,
    `📱 Numéro : ${identity.phoneDisplay}`,
    identity.country ? `🌍 Pays : ${identity.country}` : null,
    `🎖️ Membre : ${ordinal(position)} sur ${memberCount}`,
    `👑 Admins : ${adminCount}`,
    `🏷️ Groupe : ${subject}`,
    desc ? `📝 Description : ${desc.length > 120 ? desc.slice(0, 117) + '...' : desc}` : null,
    created ? `📅 Groupe créé le : ${created}` : null,
    `🕒 Arrivée : ${formatDate()} à ${formatTime()}`
  ].filter(Boolean);

  return [
    style.box('BIENVENUE', lines),
    '',
    `Bienvenue dans *${subject}* ! 🎉`,
    `> ${db.getSetting('botName', config.botName)}`
  ].join('\n');
}

function goodbyeCaption(sock, meta, jid, participant, previousCount, author) {
  const identity = buildIdentity(sock, meta, jid, participant);
  const subject = meta.subject || 'le groupe';
  const removedByAdmin = !isSelfActor(jid, participant, author);
  const actorIdentity = removedByAdmin ? buildIdentity(sock, meta, author, { id: author }) : null;

  const lines = [
    removedByAdmin ? `🛡️ @${identity.phoneDigits} a été retiré` : `🚪 @${identity.phoneDigits} a quitté`,
    `👤 Nom du compte : ${identity.accountName}`,
    identity.registeredName ? `📇 Enregistré sous : ${identity.registeredName}` : null,
    `📱 Numéro : ${identity.phoneDisplay}`,
    identity.country ? `🌍 Pays : ${identity.country}` : null,
    removedByAdmin ? `👮 Retiré par : @${actorIdentity.phoneDigits}` : '🚶 Départ volontaire',
    removedByAdmin && actorIdentity.accountName !== 'Non renseigné'
      ? `📇 Admin : ${actorIdentity.accountName}`
      : null,
    `👥 Nous étions ${previousCount} membres`,
    `🏷️ Groupe : ${subject}`,
    `🕒 Départ : ${formatDate()} à ${formatTime()}`
  ].filter(Boolean);

  return [
    style.box(removedByAdmin ? 'RETRAIT' : 'DÉPART', lines),
    '',
    removedByAdmin
      ? `Un administrateur a retiré un membre de *${subject}*.`
      : `Merci d'avoir fait partie de *${subject}*.`
  ].join('\n');
}

async function handleGroupEvent(sock, update) {
  const { id, participants, action, author } = update;
  if (!isGroup(id)) return;

  const meta = await getGroupMeta(sock, id);
  if (!meta) return;

  const entries = (participants || [])
    .map((p) => (typeof p === 'string' ? { id: p } : p))
    .filter((x) => x && x.id);

  // Promotion / retrogradation : le statut admin a change, la decision de
  // revendication doit etre recalculee.
  if (action === 'promote' || action === 'demote') {
    groupOwner.invalidateMeta(id);
  }

  // Le bot vient d'etre retire : on libere le groupe pour qu'une autre
  // session puisse le reprendre s'il y est encore.
  if (action === 'remove' && entries.some((p) => isBot(meta, sock, p.id))) {
    groupOwner.release(id, 'bot retire du groupe');
    return;
  }

  // Un seul bot traite les evenements d'un groupe (bienvenue, depart...).
  if (!(await groupOwner.ensureForEvent(sock, id))) return;

  rememberMeta(meta);

  for (const p of entries) rememberParticipant(p);

  // --- Arrivee : blacklist d'abord, presentation ensuite ---
  if (action === 'add') {
    const expelled = await handleGroupJoin(sock, update);
    if (db.getSetting(`welcome_${id}`, true) === false) return;

    const memberCount = (meta.participants || []).length || entries.length;

    for (let i = 0; i < entries.length; i++) {
      const p = entries[i];
      const jid = p.id;
      if (expelled.includes(jid)) continue;
      if (isBot(meta, sock, jid)) continue;

      const key = `add:${id}:${normalizeJid(jid)}`;
      if (seenRecently(key)) continue;

      // Position du nouveau membre dans le groupe.
      const position = Math.max(1, memberCount - (entries.length - 1 - i));

      try {
        const caption = welcomeCaption(sock, meta, jid, p, position, memberCount);
        await sendPresentation(sock, id, jid, caption);
      } catch (e) {
        console.error('[GROUP] bienvenue:', e.message);
        try {
          await sock.sendMessage(id, {
            text: `👋 Bienvenue @${normalizeJid(jid)} dans *${meta.subject || 'le groupe'}* !`,
            mentions: [jid]
          });
        } catch (err) {}
      }
    }
  }

  // --- Depart : pas de "au revoir" si l'expulsion vient du bot ---
  if (action === 'remove') {
    if (db.getSetting(`goodbye_${id}`, true) === false) return;
    const previousCount = (meta.participants || []).length + entries.length;

    for (const p of entries) {
      const jid = p.id;
      if (wasKickedByGuard(id, jid)) continue;
      if (isBot(meta, sock, jid)) continue;

      const key = `remove:${id}:${normalizeJid(jid)}`;
      if (seenRecently(key)) continue;

      const removedByAdmin = !isSelfActor(jid, p, author);
      const extraMentions = removedByAdmin ? [author] : [];

      try {
        const caption = goodbyeCaption(sock, meta, jid, p, previousCount, author);
        await sendPresentation(sock, id, jid, caption, extraMentions);
      } catch (e) {
        console.error('[GROUP] au revoir:', e.message);
        try {
          await sock.sendMessage(id, {
            text: removedByAdmin
              ? `🛡️ @${normalizeJid(jid)} a été retiré du groupe par un administrateur.`
              : `🚪 @${normalizeJid(jid)} a quitté le groupe.`,
            mentions: [jid, ...extraMentions].filter(Boolean)
          });
        } catch (err) {}
      }
    }
  }
}

module.exports = { handleGroupEvent };
