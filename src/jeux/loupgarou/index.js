'use strict';

const cfg = require('./config');
const game = require('./game');
const { extractText } = require('../commun/text');

function parse(text) {
  if (!text.startsWith(cfg.PREFIX)) return null;
  const w = text.slice(cfg.PREFIX.length).trim().split(/\s+/);
  const name = (w[0] || '').toLowerCase();
  if (name === 'vote' || name === 'voter') return { name: 'vote', args: w.slice(1) };
  if (!['lg', 'loupgarou', 'loup-garou', 'loups'].includes(name)) return null;
  const sub = (w[1] || '').toLowerCase();
  const map = {
    '': 'open', open: 'open', start: 'go', go: 'go', lancer: 'go', commencer: 'go',
    join: 'join', rejoindre: 'join', jouer: 'join',
    leave: 'leave', quitter: 'leave',
    stop: 'stop', arreter: 'stop', annuler: 'stop',
    status: 'status', joueurs: 'status', liste: 'status',
    roles: 'help', regles: 'help', aide: 'help', help: 'help'
  };
  return { name: map[sub] || 'help', args: w.slice(2) };
}

async function handleMessage(sock, msg) {
  try {
    const chatId = msg && msg.key && msg.key.remoteJid;
    if (!chatId || !msg.message) return false;
    const text = extractText(msg);

    if (!chatId.endsWith('@g.us')) {
      // message privé : réponses des joueurs (cupidon, voyante, loups, sorcière, chasseur)
      return text ? await game.handlePrivate(sock, msg, text) : false;
    }

    const cmd = parse(text);
    if (!cmd) return false;
    if (cmd.name === 'vote') return await game.vote(sock, msg, cmd.args);
    if (cmd.name === 'open') await game.open(sock, msg);
    else if (cmd.name === 'join') await game.join(sock, msg);
    else if (cmd.name === 'leave') await game.leave(sock, msg);
    else if (cmd.name === 'go') await game.go(sock, msg);
    else if (cmd.name === 'stop') await game.stop(sock, msg);
    else if (cmd.name === 'status') await game.status(sock, msg);
    else await game.help(sock, msg);
    return true;
  } catch (e) {
    console.error('[loup-garou] erreur:', e && e.stack ? e.stack : e);
    return false;
  }
}

module.exports = { handleMessage, recover: game.recover, abortSession: game.abortSession, _games: game._games };
