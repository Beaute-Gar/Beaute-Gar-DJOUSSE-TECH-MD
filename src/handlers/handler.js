'use strict';

const style = require('../config/style');
const config = require('../config/config');
const db = require('../lib/database');
const { extractText } = require('../lib/message');
const { isGroup, normalizeJid } = require('../lib/helpers');
const groupOwner = require('../core/group-owner');
const cmdHandler = require('./command-handler');
const { handleProtection } = require('./protection-handler');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const actionverite = require('../jeux/actionverite');
const jeux = require('../jeux');

function safeHasGame(mod, chatId) {
  try {
    return !!(mod && mod._games && typeof mod._games.has === 'function' && mod._games.has(chatId));
  } catch (_) {
    return false;
  }
}

async function handleMessage(sock, m) {
  if (!m.message) return;
  
  const from = m.key.remoteJid;
  if (!from || from === 'status@broadcast') return;

  // 1. --- MODE, PROPRIETAIRE ET JEUX ---
  const currentMode = db.getSetting('mode') || 'public';
  // Le numero du bot doit etre celui de CE socket : avec plusieurs sessions,
  // le reglage global "botNumber" est ecrase par la derniere connectee.
  const myRealNumber = normalizeJid(sock.user && sock.user.id) || db.getSetting('botNumber');
  const senderJid = m.key.participant || m.key.remoteJid;
  const auth = require('../lib/auth');
  const isOwnerMsg = !!(
    m.key.fromMe ||
    (myRealNumber && String(senderJid).includes(myRealNumber)) ||
    auth.isOwner(sock, m, config, from)
  );

  // En mode self, les membres peuvent participer aux jeux, mais leurs commandes
  // ne reçoivent pas de réponse. Les protections doivent quand même s'appliquer.
  const text = extractText(m).trim();
  const isGameCommand = /^\.\s*(jouer|quiz|quizstop|quizscore|quizcat|quizz|startquiz|stopquiz|lg|loupgarou|loup-garou|loups|vote|voter|modenuit|nightmode|nuit|start\s+game|stop\s+game|dare|defi|défi|truth|verite|vérité)\b/i.test(text);
  const hasActiveGame = isGroup(from) && (
    safeHasGame(require('../jeux/actionverite'), from) ||
    safeHasGame(require('../jeux/quiz'), from) ||
    safeHasGame(require('../jeux/loupgarou'), from)
  );
  const memberSelfNoCmd = currentMode === 'self' && !isOwnerMsg && !(isGameCommand || hasActiveGame);

  // 2. --- ROUTAGE GROUPE / MULTI-SESSION ---
  // Si plusieurs sessions du bot sont présentes dans le groupe, chaque session
  // ne traite que les messages de son propre compte. Sinon, une seule session
  // possède le groupe pour éviter les doublons.
  if (isGroup(from)) {
    const mySession = auth.normalizeNumber(sock.user && sock.user.id) || auth.normalizeNumber(groupOwner.sessionOf(sock));
    const senderNums = (typeof auth.senderCandidates === 'function')
      ? auth.senderCandidates(m, m.key.participant || m.key.remoteJid || from)
      : [auth.normalizeNumber(m.key.participant || m.key.remoteJid || from)].filter(Boolean);
    const connectedOwners = auth.getConnectedOwners();
    const senderSession = senderNums.find((n) => connectedOwners.includes(n)) || '';
    const senderIsConnectedSession = !!senderSession;
    const isClaimCmd = /^\.\s*claim\b/i.test(text);

    let multiSession = false;
    try { multiSession = await groupOwner.isMultiSession(sock, from); } catch (_) {}

    if (multiSession) {
      // Multi-sessions : chaque session écoute uniquement son propre compte.
      const myNumber = normalizeJid(sock.user && sock.user.id) || groupOwner.sessionOf(sock);
      const isMine = Boolean(
        m.key.fromMe ||
        (myNumber && senderNums.includes(myNumber))
      );
      if (!isMine) return;
    } else if (senderIsConnectedSession) {
      // Un message envoyé par une session connectée : seule la session émettrice
      // le traite (exécution/réponse depuis son compte). Les autres l'ignorent.
      // Exception : .claim reste géré par le routeur (coordination inter-sessions).
      if (isClaimCmd) {
        const verdict = await groupOwner.route(sock, m, from);
        if (verdict !== 'process') return;
      } else if (mySession !== senderSession) {
        return;
      }
      // sinon (ma session = émetteur), on continue le traitement ici.
    } else {
      // Message d'un membre/non-session : une seule session le traite (anti-doublon).
      const verdict = await groupOwner.route(sock, m, from);
      if (verdict !== 'process') return;
    }
  }

  // 3. --- JEU ACTION OU VÉRITÉ (avant les protections et les commandes) ---
  // Gère .start game / .jouer / .stop game / .dare / .truth et les réponses des joueurs.
  try {
    if (await actionverite.handleMessage(sock, m)) return;
  } catch (e) {
    console.error('[ACTIONVERITE ERROR]', e);
  }

  // 4. --- QUIZ, LOUP-GAROU, MODE NUIT ---
  // Chaque module attrape ses erreurs : un jeu cassé ne bloque jamais le bot.
  try {
    if (await jeux.handleMessage(sock, m)) return;
  } catch (e) {
    console.error('[JEUX ERROR]', e);
  }

  // 5. --- PROTECTIONS AUTOMATIQUES ---
  // En mode self, on analyse aussi les messages des membres (sans leur répondre aux commandes).
  try {
    await handleProtection(sock, m);
  } catch (e) {
    console.error('[PROTECTION ERROR]', e);
  }

  // En mode self, seuls le propriétaire/bot peuvent utiliser les commandes.
  if (memberSelfNoCmd) return;

  // 6. --- EXTRACTION DU TEXTE ET COMMANDES ---
  if (!text || !text.startsWith(config.prefix)) return;

  const body = text.slice(config.prefix.length).trim();
  if (!body) return;

  // En mode self, ignorer silencieusement les commandes des non-propriétaires.
  if (currentMode === 'self' && !isOwnerMsg) return;

  const [rawCmd, ...args] = body.split(/\s+/);
  const command = cmdHandler.find(rawCmd);

  if (!command) {
    await sock.sendMessage(from, {
      text: style.renderError(['Commande inconnue : ' + config.prefix + rawCmd, 'Tapez ' + config.prefix + 'menu'])
    });
    return;
  }

  // 7. --- EXECUTION DE LA COMMANDE ---
  try {
    await command.execute(sock, m, from, args, { config, style });
    if (db.getSetting('autoreact', true)) {
      try {
        await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
      } catch (_) { /* ignore */ }
    }
  } catch (err) {
    console.error('[handler] Erreur dans ' + command.name + ':', err);
    await sock.sendMessage(from, {
      text: style.renderError(['Erreur : ' + err.message])
    });
    if (db.getSetting('autoreact', true)) {
      try {
        await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
      } catch (_) { /* ignore */ }
    }
  }
}

module.exports = { handleMessage };

