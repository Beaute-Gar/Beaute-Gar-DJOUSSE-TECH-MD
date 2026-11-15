'use strict';

/**
 * DJOUSSE TECH MD — module Action ou Vérité
 *
 * Utilisation dans le handler de messages (une seule ligne, au début) :
 *   const actionverite = require('../jeux/actionverite');
 *   if (await actionverite.handleMessage(sock, msg)) return;
 *
 * Commandes gérées : .start game [soft|hot|extreme], .jouer, .stop game, .dare [niveau], .truth [niveau]
 */

const cfg = require('./config');
const game = require('./game');
const content = require('./content');
const style = require('../../config/style');

function parseCommand(text) {
  if (!text.startsWith(cfg.PREFIX)) return null;
  const words = text.slice(cfg.PREFIX.length).trim().split(/\s+/);
  const w0 = (words[0] || '').toLowerCase();
  const w1 = (words[1] || '').toLowerCase();

  if (w0 === 'startgame' || (w0 === 'start' && w1 === 'game')) {
    return { name: 'start', args: words.slice(w0 === 'startgame' ? 1 : 2) };
  }
  if (w0 === 'stopgame' || (w0 === 'stop' && w1 === 'game')) return { name: 'stop', args: [] };
  if (w0 === 'jouer') return { name: 'jouer', args: [] };
  if (['dare', 'defi', 'défi'].includes(w0)) return { name: 'dare', args: words.slice(1) };
  if (['truth', 'verite', 'vérité'].includes(w0)) return { name: 'truth', args: words.slice(1) };
  return null;
}

async function single(sock, msg, kind, args) {
  const chatId = msg.key.remoteJid;
  const level = game.levelFrom(args[0]) || cfg.DEFAULT_LEVEL;
  const res = await content.get(kind, level, chatId);
  const title = kind === 'dare' ? 'ACTION' : 'VÉRITÉ';
  await sock.sendMessage(chatId, {
    text: style.box(title, [res.text, 'Source : ' + res.source])
  }, { quoted: msg });
}

async function handleMessage(sock, msg) {
  try {
    const chatId = msg && msg.key && msg.key.remoteJid;
    if (!chatId || !msg.message) return false;

    const text = game.extractText(msg);
    const cmd = parseCommand(text);

    // En privé, seules les commandes simples .dare / .truth sont prises en charge.
    if (!chatId.endsWith('@g.us')) {
      if (cmd && (cmd.name === 'dare' || cmd.name === 'truth')) {
        await single(sock, msg, cmd.name, cmd.args);
        return true;
      }
      return false;
    }

    if (cmd) {
      if (cmd.name === 'start') await game.startGame(sock, msg, cmd.args);
      else if (cmd.name === 'stop') await game.stopGame(sock, msg);
      else if (cmd.name === 'jouer') await game.register(sock, msg);
      else await single(sock, msg, cmd.name, cmd.args);
      return true;
    }

    if (text.startsWith(cfg.PREFIX) && !msg.key.fromMe) {
      // autre commande : on laisse le handler principal la traiter
      return false;
    }
    return await game.handleGameMessage(sock, msg, text);
  } catch (e) {
    console.error('[actionverite] erreur:', e && e.stack ? e.stack : e);
    return false;
  }
}

module.exports = { handleMessage, recover: game.recover, abortSession: game.abortSession, _games: game._games };
