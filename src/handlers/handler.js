'use strict';
const { normalizeMessageContent } = require('@whiskeysockets/baileys');
const { resolveSender, botIdentities } = require('../lib/sender');
const { getGroupMeta, bindInvalidation, isAdminOf } = require('../lib/group-cache');
const { getMode } = require('../lib/session-mode');
const { claim, sessionOwning } = require('../lib/dedupe');
const { gate, deniedText } = require('../lib/gate');
const { find: findCommand } = require('./command-handler');
const config = require('../config/config');
const style = require('../config/style');

const TTL = 120_000;
const sentIds = new Set(); // anti-boucle : IDs des messages envoyés par le bot
const handled = new Set(); // anti-doublon : un même message n'est exécuté qu'une fois par session

const remember = (set, key) => {
  set.add(key);
  setTimeout(() => set.delete(key), TTL).unref();
};

// "237690000000:12@s.whatsapp.net" -> "237690000000"
const digitsOf = (j) => (j ? jidNormalizedUser(j) : '');
const digits = (j) => (j || '').split('@')[0].split(':')[0].replace(/\D/g, '');

// ─────────────────────────────────────────────────────────────────────────────
// Initialisation du socket et suivi des messages envoyés
// ─────────────────────────────────────────────────────────────────────────────
function trackSends(sock) {
  const orig = sock.sendMessage.bind(sock);
  sock.sendMessage = async (...args) => {
    const res = await orig(...args);
    const id = res?.key?.id;
    if (id) remember(sentIds, id);
    return res;
  };
}

// extraction du texte du message
function extractText(msg) {
  const c = normalizeMessageContent(msg.message) || {};
  return (c.conversation || c.extendedTextMessage?.text || c.imageMessage?.caption || c.videoMessage?.caption || '').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Écouteur principal de messages entrants
// ─────────────────────────────────────────────────────────────────────────────
async function onMessage(sock, sessionId, msg) {
  const modeOf = getMode;

  // 1. Filtres de base
  if (!msg?.message || msg.key.remoteJid === 'status@broadcast') return;
  if (msg.message.protocolMessage) return;
  if (sentIds.has(msg.key.id)) return;
  const ts = Number(msg.messageTimestamp || 0);
  if (ts && Date.now() / 1000 - ts > 60) return; // rattrapage au démarrage
  const text = extractText(msg);
  if (!text.startsWith(config.prefix)) return;

  // 2. ✅ Identification de l'expéditeur réel + mode de CETTE session
  const sender = resolveSender(sock, msg);
  const mode = modeOf(sessionId);

  // 2bis. ✅ Propriétaire d'une AUTRE session connectée : c'est elle qui traite
  const ownerSession = sessionOwning(sender.ids);
  if (ownerSession && ownerSession !== sessionId) return;
  const isSessionOwner = sender.isFromMe || ownerSession === sessionId;
  const isOwner = isSessionOwner || (config.ownerNumber && String(sender.number).includes(config.ownerNumber));

  // 3. ✅ .self : mode volontaire - protections activées pour cette session seulement
  // Si mode .self, protections activées pour le propriétaire de cette session ONLY
  // Si mode .public, protections désactivées (comportement par défaut)
  if (mode === 'self' && !isSessionOwner) {
    console.log(`[MODE] session=${sessionId} mode=self ignore ${sender.number} @ ${sender.chatJid}`);
    return;
  }

  // 4. ✅ Anti-doublon (même message livré deux fois) puis verrou partagé entre sessions.
  const dupKey = `${sessionId}:${sender.chatJid}:${msg.key.id}`;
  if (handled.has(dupKey)) return;
  remember(handled, dupKey);
  if (!claim(sender.chatJid, msg.key.id, sessionId)) return;

  // 4bis. ✅ Extraction du nom de commande et des arguments
  const body = text.slice(config.prefix.length).trim();
  if (!body) return;
  const [rawName, ...args] = body.split(/\s+/);
  const command = findCommand(rawName);
  if (!command) {
    await sock.sendMessage(sender.chatJid, { text: style.renderError([`Commande inconnue : *${config.prefix}${rawName}*. Tapez *${config.prefix}menu*`]), mentions: [sender.jid] }, { quoted: msg });
    return;
  }

  // 5. ✅ Statut admin (groupe uniquement, et seulement si nécessaire)
  let meta = null, isAdmin = false, isBotAdmin = false;
  if (sender.isGroup && (command.adminOnly || command.botAdmin)) {
    meta = await getGroupMeta(sock, sender.chatJid);
    isAdmin = isAdminOf(meta, sender.ids);
    isBotAdmin = isAdminOf(meta, botIdentities(sock));
  }

  // 6. ✅ Décision centrale (gate)
  const decision = gate({ mode, isOwner, isGroup: sender.isGroup, isAdmin, isBotAdmin, cmd: command });
  console.log(`[CMD] session=${sessionId} mode=${mode} ${sender.number} @ ${sender.chatJid} → ${rawName} | ${decision.action}${decision.reason ? ':' + decision.reason : ''}`);

  const reply = (t, extra = {}) =>
    sock.sendMessage(sender.chatJid, { text: t, mentions: [sender.jid], ...extra }, { quoted: msg });

  if (decision.action === 'ignore') return;
  if (decision.action === 'deny') return reply(style.renderError([deniedText(decision.reason, sender.number)]));

  // 7. Exécution de la commande (signature réelle : sock, msg, from, args)
  try {
    await command.execute(sock, msg, sender.chatJid, args);
  } catch (e) {
    console.error(`[CMD] erreur dans ${rawName}:`, e);
    await sock.sendMessage(sender.chatJid, { text: style.renderError([`Une erreur est survenue dans la commande *${rawName}*.`]), mentions: [sender.jid] }, { quoted: msg });
  }
}

function attachHandler(sock, sessionId) {
  if (sock.__djHandlerAttached) return; // évite un double branchement
  sock.__djHandlerAttached = true;
  trackSends(sock);
  bindInvalidation(sock);
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try { await onMessage(sock, sessionId, msg); }
      catch (e) { console.error('[CMD] erreur:', e); }
    }
  });
}

// Alias pour compatibilite avec index.js qui attend handleMessage(sock, msg)
async function handleMessage(sock, msg) {
  const sessionId = (sock.user && sock.user.id) || msg.key.remoteJid;
  await onMessage(sock, sessionId, msg);
}

module.exports = { attachHandler, onMessage, handleMessage };