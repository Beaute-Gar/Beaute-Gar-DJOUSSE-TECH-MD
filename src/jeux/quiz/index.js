'use strict';

const cfg = require('./config');
const engine = require('./engine');
const { extractText } = require('../commun/text');

function parse(text) {
  if (!text.startsWith(cfg.PREFIX)) return null;
  const w = text.slice(cfg.PREFIX.length).trim().split(/\s+/);
  const name = (w[0] || '').toLowerCase();
  const map = {
    quiz: 'start', quizz: 'start', startquiz: 'start',
    quizstop: 'stop', stopquiz: 'stop',
    quizscore: 'scores', quizscores: 'scores', classementquiz: 'scores', topquiz: 'scores',
    quizcat: 'cats', quizcategories: 'cats'
  };
  return map[name] ? { name: map[name], args: w.slice(1) } : null;
}

async function handleMessage(sock, msg) {
  try {
    const chatId = msg && msg.key && msg.key.remoteJid;
    if (!chatId || !chatId.endsWith('@g.us') || !msg.message) return false;
    const text = extractText(msg);
    const cmd = parse(text);
    if (cmd) {
      if (cmd.name === 'start') await engine.start(sock, msg, cmd.args);
      else if (cmd.name === 'stop') await engine.stop(sock, msg);
      else if (cmd.name === 'scores') await engine.scores(sock, msg);
      else await engine.categories(sock, msg);
      return true;
    }
    if (text.startsWith(cfg.PREFIX)) return false;
    return await engine.handleAnswer(sock, msg, text);
  } catch (e) {
    console.error('[quiz] erreur:', e && e.stack ? e.stack : e);
    return false;
  }
}

module.exports = { handleMessage, recover: engine.rebind, abortSession: engine.abortSession, _games: engine._games };
