'use strict';

/**
 * DISPATCHEUR DES JEUX ET AUTOMATISMES — DJOUSSE TECH MD
 *
 * Dans ton handler de messages (une seule ligne, au tout début) :
 *     if (await require('../jeux').handleMessage(sock, msg)) return;
 *
 * Quand la connexion WhatsApp s'ouvre (une fois) :
 *     require('../jeux').start(sock);
 *
 * Un module cassé n'empêche jamais les autres de fonctionner : chaque module est chargé
 * séparément et toute erreur est interceptée.
 */

const MODULES = [
  ['modenuit', () => require('../groupe/modenuit')],
  ['quiz', () => require('./quiz')],
  ['loupgarou', () => require('./loupgarou')]
  // actionverite est branché directement dans le handler (ne pas le doubler ici).
];

const loaded = [];
for (const [name, load] of MODULES) {
  try {
    loaded.push({ name, mod: load() });
  } catch (e) {
    console.error('[jeux] module « ' + name + ' » non chargé :', e.message);
  }
}

async function handleMessage(sock, msg) {
  for (const { name, mod } of loaded) {
    try {
      if (mod.handleMessage && (await mod.handleMessage(sock, msg))) return true;
    } catch (e) {
      console.error('[jeux] erreur dans « ' + name + ' » :', e && e.message);
    }
  }
  return false;
}

/** À appeler quand la connexion s'ouvre : démarre le mode nuit et rouvre les groupes restés fermés après un crash. */
async function start(sock) {
  for (const { name, mod } of loaded) {
    try {
      if (typeof mod.start === 'function') mod.start(sock);
      if (typeof mod.recover === 'function') await mod.recover(sock);
    } catch (e) {
      console.error('[jeux] démarrage de « ' + name + ' » :', e && e.message);
    }
  }
}

/** À appeler quand une session se déconnecte définitivement : oublie son socket. */
function stopSession(sessionId) {
  for (const { name, mod } of loaded) {
    try {
      if (typeof mod.stopSession === 'function') mod.stopSession(sessionId);
    } catch (e) {
      console.error('[jeux] arrêt de « ' + name + ' » :', e && e.message);
    }
  }
}

/** À appeler quand une session se déconnecte définitivement : annule ses parties. */
async function abortSession(sessionId, fallbackSock) {
  for (const { name, mod } of loaded) {
    try {
      if (typeof mod.abortSession === 'function') await mod.abortSession(sessionId, fallbackSock);
    } catch (e) {
      console.error('[jeux] abandon de « ' + name + ' » :', e && e.message);
    }
  }
}

module.exports = { handleMessage, start, stopSession, abortSession };
