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

  // 1. --- VERIFICATION DU MODE SELF ---
  const currentMode = db.getSetting('mode') || 'public';
  // Le numero du bot doit etre celui de CE socket : avec plusieurs sessions,
  // le reglage global "botNumber" est ecrase par la derniere connectee.
  const myRealNumber = normalizeJid(sock.user && sock.user.id) || db.getSetting('botNumber');
  const senderJid = m.key.participant || m.key.remoteJid;

  // En mode self, les messages des membres sont ignores par defaut. On fait
  // exception pour les jeux de groupe : commandes et reponses doivent pouvoir
  // etre traites pour que les membres puissent participer (Action ou Verite,
  // Quiz, Loup-Garou, Mode nuit).
  const text = extractText(m).trim();
  const isGameCommand = /^\.\s*(jouer|quiz|quizstop|quizscore|quizcat|quizz|startquiz|stopquiz|lg|loupgarou|loup-garou|loups|vote|voter|modenuit|nightmode|nuit|start\s+game|stop\s+game|dare|defi|défi|truth|verite|vérité)\b/i.test(text);
  const hasActiveGame = isGroup(from) && (
    safeHasGame(require('../jeux/actionverite'), from) ||
    safeHasGame(require('../jeux/quiz'), from) ||
    safeHasGame(require('../jeux/loupgarou'), from)
  );

  if (currentMode === 'self') {
    if (!m.key.fromMe && (!myRealNumber || !String(senderJid).includes(myRealNumber))) {
      if (!(isGameCommand || hasActiveGame)) {
        return; // Ignore totalement les inconnus
      }
    }
  }

  // 2. --- UN SEUL BOT PAR GROUPE ---
  // Si plusieurs comptes du bot sont dans le meme groupe, une seule session
  // doit traiter les messages. Les autres ignorent totalement le groupe.
  if (isGroup(from)) {
    const verdict = await groupOwner.route(sock, m, from);
    if (verdict !== 'process') return;
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
  try {
    await handleProtection(sock, m);
  } catch (e) {
    console.error('[PROTECTION ERROR]', e);
  }

  // 6. --- EXTRACTION DU TEXTE ET COMMANDES ---
  if (!text || !text.startsWith(config.prefix)) return;

  const body = text.slice(config.prefix.length).trim();
  if (!body) return;

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

