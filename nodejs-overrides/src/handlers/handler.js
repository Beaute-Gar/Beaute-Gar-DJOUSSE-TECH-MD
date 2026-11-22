'use strict';

const { normalizeMessageContent, jidNormalizedUser } = require('@whiskeysockets/baileys');
const { resolveSender, botIdentities } = require('../lib/sender');
const { getGroupMeta, bindInvalidation, isAdminOf } = require('../lib/group-cache');
const { getMode } = require('../lib/session-mode');
const { claim, sessionOwning } = require('../lib/dedupe');
const { gate, deniedText } = require('../lib/gate');
const { findCommand } = require('../command-loader');
const appConfig = require('../config/config');
const messageStyle = require('../utils/messageStyle');

const TTL = 120_000;
const sentIds = new Set(); // anti-boucle : IDs des messages envoyes par le bot
const handled = new Set(); // anti-doublon : un meme message n'est execute qu'une fois par session

const remember = (set, key) => {
  set.add(key);
  setTimeout(() => set.delete(key), TTL).unref();
};

const digitsOf = (j) => (j ? jidNormalizedUser(j) : '');
const digits = (j) => (j || '').split('@')[0].split(':')[0].replace(/\D/g, '');

/* Uniformisation centralisee : textes simples ET legendes de medias passent
   par le style officiel. Les blocs de code, URLs seules, codes a copier et
   messages deja cadres ne sont pas touches. Le media lui-meme n'est jamais
   modifie : seule sa legende textuelle est formatee. */
function styledText(value) {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text || text.length > 4000) return value;
  if (text.startsWith('╭') || text.includes('```')) return value;
  if (/^https?:\/\/\S+$/.test(text)) return value;
  if (/^[A-Z0-9][A-Z0-9-]{3,31}$/.test(text)) return value; // codes a recopier
  return messageStyle.format(text);
}

function styleOutgoing(content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return;
  if (content.noStyle || content.styleOff || content.__raw) return;
  if (typeof content.text === 'string') content.text = styledText(content.text);
  if (typeof content.caption === 'string') content.caption = styledText(content.caption);
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialisation du socket et suivi des messages envoyes
// ─────────────────────────────────────────────────────────────────────────────
const STYLE_FLAG = Symbol.for('djousse.outboundStyle');

/* Installé sur TOUS les sockets, y compris pour les événements qui ne passent
   pas par onMessage (antidelete, bienvenue, départs, protections). Sans cela,
   seulement les réponses de commandes étaient stylées. */
function installOutboundStyle(sock) {
  if (!sock || sock[STYLE_FLAG]) return sock;
  try { sock[STYLE_FLAG] = true; } catch (e) { /* socket non extensible */ }
  const orig = sock.sendMessage.bind(sock);
  sock.sendMessage = async (...args) => {
    styleOutgoing(args[1]);
    return orig(...args);
  };
  return sock;
}

function trackSends(sock) {
  installOutboundStyle(sock);
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

/* Une seule invocation de commande : on fournit un socket "hybride" qui est
   a la fois le vrai socket (prototype) et le contexte de commande.
   Cela supprime l'ancien fallback qui re-excutait la commande avec un objet en
   premier argument : c'etait cette re-execution qui produisait
   `sock.sendMessage is not a function` dans menu.js:53 apres une erreur initiale. */
function makeCommandSocket(sock, ctx) {
  let hybrid;
  try { hybrid = Object.create(sock); }
  catch (e) { hybrid = Object.assign({}, sock); }
  Object.assign(hybrid, {
    sock: sock,
    client: sock,
    msg: ctx.msg,
    m: ctx.msg,
    sender: ctx.sender,
    from: ctx.from,
    chatJid: ctx.from,
    args: ctx.args,
    text: ctx.args.join(' '),
    reply: ctx.reply,
    meta: ctx.meta,
    isAdmin: ctx.isAdmin,
    isBotAdmin: ctx.isBotAdmin,
    isOwner: ctx.isOwner,
    sessionId: ctx.sessionId,
    mode: ctx.mode
  });
  return hybrid;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ecouteur principal de messages entrants
// ─────────────────────────────────────────────────────────────────────────────
async function onMessage(sock, sessionId, msg, config = {}) {
  const find = config.findCommand || findCommand;   // injectables pour les tests
  const modeOf = config.modeOf || getMode;
  const prefix = config.prefix || appConfig.prefix || '.';

  // 1. Filtres de base
  if (!msg?.message || msg.key.remoteJid === 'status@broadcast') return;
  if (msg.message.protocolMessage) return;
  if (sentIds.has(msg.key.id)) return;
  const ts = Number(msg.messageTimestamp || 0);
  if (ts && Date.now() / 1000 - ts > 60) return; // rattrapage au demarrage
  const text = extractText(msg);
  if (!text.startsWith(prefix)) return;

  // 2. Identification de l'expediteur reel + mode de CETTE session
  const sender = resolveSender(sock, msg);
  const mode = modeOf(sessionId);

  // 2bis. Proprietaire d'une AUTRE session connectee : c'est elle qui traite
  const ownerSession = sessionOwning(sender.ids);
  if (ownerSession && ownerSession !== sessionId) return;
  const isSessionOwner = sender.isFromMe || ownerSession === sessionId;
  const isOwner = isSessionOwner || (config.owners || [appConfig.ownerNumber]).includes(sender.number);

  // 3. .self : mode volontaire - protections activees pour cette session seulement
  if (mode === 'self' && !isSessionOwner) {
    console.log(`[MODE] session=${sessionId} mode=self ignore ${sender.number} @ ${sender.chatJid}`);
    return;
  }

  // 4. Anti-doublon (meme message livre deux fois) puis verrou partage entre sessions.
  const dupKey = `${sessionId}:${sender.chatJid}:${msg.key.id}`;
  if (handled.has(dupKey)) return;
  remember(handled, dupKey);
  if (!claim(sender.chatJid, msg.key.id, sessionId)) return;

  // 4bis. Extraction du nom de commande et des arguments
  const body = text.slice(prefix.length).trim();
  if (!body) return;
  const [rawName, ...args] = body.split(/\s+/);
  const command = find(rawName);
  if (!command) {
    await sock.sendMessage(sender.chatJid, {
      text: messageStyle.error([`Commande inconnue : ${prefix}${rawName}`, `Tapez ${prefix}menu`]),
      mentions: [sender.jid]
    }, { quoted: msg });
    return;
  }

  // 5. Statut admin (groupe uniquement, et seulement si necessaire)
  let meta = null, isAdmin = false, isBotAdmin = false;
  if (sender.isGroup && (command.adminOnly || command.botAdmin)) {
    meta = await getGroupMeta(sock, sender.chatJid);
    isAdmin = isAdminOf(meta, sender.ids);
    isBotAdmin = isAdminOf(meta, botIdentities(sock));
  }

  // 6. Decision centrale (gate)
  const decision = gate({ mode, isOwner, isGroup: sender.isGroup, isAdmin, isBotAdmin, cmd: command });
  console.log(`[CMD] session=${sessionId} mode=${mode} ${sender.number} @ ${sender.chatJid} → ${rawName} | ${decision.action}${decision.reason ? ':' + decision.reason : ''}`);

  const reply = (t, extra = {}) =>
    sock.sendMessage(sender.chatJid, { text: t, mentions: [sender.jid], ...extra }, { quoted: msg });

  if (decision.action === 'ignore') return;
  if (decision.action === 'deny') return reply(deniedText(decision.reason, sender.number));

  // 7. Execution de la commande (une seule fois, quelle que soit sa signature)
  const ctx = { sender, msg, reply, meta, isAdmin, isBotAdmin, isOwner, sessionId, mode, from: sender.chatJid, args };
  try {
    const res = command.execute(makeCommandSocket(sock, ctx), msg, sender.chatJid, args, ctx);
    if (res && typeof res.then === 'function') await res;
  } catch (e) {
    // On journalise l'erreur REELLE : elle n'est plus masquee par un fallback.
    console.error(`[CMD] erreur dans ${rawName}:`, (e && e.stack) || e);
    try {
      await sock.sendMessage(sender.chatJid, {
        text: messageStyle.error([`Une erreur est survenue dans la commande ${prefix}${rawName}.`, (e && e.message) || '']),
        mentions: [sender.jid]
      }, { quoted: msg });
    } catch (sendErr) {
      console.error('[CMD] envoi du message d\'erreur impossible :', sendErr && sendErr.message);
    }
  }
}

function attachHandler(sock, sessionId, config) {
  if (sock.__djHandlerAttached) return; // evite un double branchement
  sock.__djHandlerAttached = true;
  trackSends(sock);
  bindInvalidation(sock);
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try { await onMessage(sock, sessionId, msg, config); }
      catch (e) { console.error('[CMD] erreur:', e); }
    }
  });
}

// Alias pour compatibilite avec index.js qui attend handleMessage(sock, msg)
async function handleMessage(sock, msg) {
  const sessionId = (sock.user && sock.user.id) || msg.key.remoteJid;
  const config = { prefix: appConfig.prefix || '.', owners: [appConfig.ownerNumber] };
  await onMessage(sock, sessionId, msg, config);
}

module.exports = { attachHandler, onMessage, handleMessage, installOutboundStyle, styleOutgoing };
