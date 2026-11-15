'use strict';

const cfg = require('./config');
const ids = require('../commun/ids');
const store = require('../commun/store');
const { extractText, sleep, decorate } = require('../commun/text');
const groupOwner = require('../../core/group-owner');
const source = require('./source');
const { isCorrect, hint } = require('./match');

const games = new Map(); // chatId -> partie

const log = (...a) => console.log('[quiz]', ...a);
const tag = (jid) => '@' + ids.num(jid);

/** Garde le socket de la session propriétaire de la partie (jamais celui d'une autre session). */
function bind(g, sock) {
  if (!g || !sock) return;
  const current = groupOwner.sessionOf(g.sock);
  const next = groupOwner.sessionOf(sock);
  if (!current || !next || current === next) g.sock = sock;
}

/** Après une reconnexion, la même session reprend ses parties avec le nouveau socket. */
function rebind(sock) {
  const me = groupOwner.sessionOf(sock);
  if (!me) return;
  for (const g of games.values()) {
    if (groupOwner.sessionOf(g.sock) === me) g.sock = sock;
  }
}

async function send(g, text, mentions) {
  try {
    await g.sock.sendMessage(g.chatId, { text: decorate(text), mentions: mentions || [] });
  } catch (e) {
    console.error('[quiz] envoi impossible:', e.message);
  }
}

async function reply(sock, msg, text, mentions) {
  try {
    await sock.sendMessage(msg.key.remoteJid, { text: decorate(text), mentions: mentions || [] }, { quoted: msg });
  } catch (e) {
    console.error('[quiz] réponse impossible:', e.message);
  }
}

function scoreTable(g) {
  const rows = [...g.scores.entries()].sort((a, b) => b[1].pts - a[1].pts);
  const medals = ['🥇', '🥈', '🥉'];
  return {
    text: rows.map(([jid, s], i) => (medals[i] || (i + 1) + '.') + ' ' + tag(jid) + ' — ' + s.pts + ' pts (' + s.wins + ' bonne' + (s.wins > 1 ? 's' : '') + ')').join('\n'),
    mentions: rows.map(([jid]) => jid),
    rows
  };
}

/* ---------- déroulement ---------- */

async function runQuiz(g) {
  try {
    g.prefetch = source.next(g.chatId, g.cat);
    for (let i = 1; i <= g.count && !g.stopped; i++) {
      const q = await g.prefetch;
      g.prefetch = i < g.count ? source.next(g.chatId, g.cat) : null;
      await ask(g, q, i);
      if (g.stopped) break;
      if (i < g.count) await sleep(cfg.PAUSE_MS);
    }
  } catch (e) {
    console.error('[quiz] erreur de partie:', e && e.stack ? e.stack : e);
    await send(g, '⚠️ Une erreur est survenue, le quiz s\'arrête.');
  } finally {
    await endQuiz(g);
  }
}

function ask(g, q, i) {
  return new Promise((resolve) => {
    const cur = { q, i, startedAt: Date.now(), winner: null, locked: false, resolve, timer: null, hintTimer: null };
    g.current = cur;
    const finish = () => {
      clearTimeout(cur.timer);
      clearTimeout(cur.hintTimer);
      if (g.current === cur) g.current = null;
      resolve();
    };
    cur.finish = finish;

    send(
      g,
      '❓ *Question ' + i + '/' + g.count + '*' + (q.cat && q.cat !== 'mix' ? ' — ' + (source.CATEGORIES[q.cat] || q.cat) : '') +
        '\n\n' + q.q + '\n\n⏱️ ' + Math.round(cfg.TIME_MS / 1000) + ' secondes — le premier qui répond juste gagne les points !'
    ).then(() => {
      if (g.stopped || g.current !== cur) return finish();
      cur.startedAt = Date.now();
      cur.hintTimer = setTimeout(() => {
        if (g.current === cur && !cur.locked) send(g, '💡 Indice : ' + hint(q.a));
      }, Math.floor(cfg.TIME_MS / 2));
      cur.timer = setTimeout(async () => {
        if (g.current !== cur || cur.locked) return;
        cur.locked = true;
        await send(g, '⌛ Temps écoulé ! La réponse était : *' + q.a + '*');
        finish();
      }, cfg.TIME_MS);
    });
  });
}

async function onCorrect(g, msg, jid, name) {
  const cur = g.current;
  if (!cur || cur.locked) return;
  cur.locked = true;
  clearTimeout(cur.timer);
  clearTimeout(cur.hintTimer);

  const left = Math.max(0, cfg.TIME_MS - (Date.now() - cur.startedAt));
  const pts = cfg.BASE_POINTS + Math.round(cfg.BONUS_POINTS * (left / cfg.TIME_MS));
  const s = g.scores.get(jid) || { pts: 0, wins: 0, name };
  s.pts += pts;
  s.wins += 1;
  if (name) s.name = name;
  g.scores.set(jid, s);

  await send(g, '✅ Bravo ' + tag(jid) + ' ! La réponse était *' + cur.q.a + '*\n+' + pts + ' pts (total : ' + s.pts + ')', [jid]);
  cur.finish();
}

async function endQuiz(g) {
  try {
    const t = scoreTable(g);
    if (t.rows.length) {
      await send(g, (g.stopped ? '🏁 *Quiz arrêté — scores :*' : '🏆 *Fin du quiz !*') + '\n\n' + t.text, t.mentions);
      persist(g);
    } else {
      await send(g, g.stopped ? '🛑 Quiz arrêté.' : '😶 Fin du quiz : personne n\'a marqué de point. À la prochaine !');
    }
  } catch (e) {
    console.error('[quiz] fin de partie:', e.message);
  } finally {
    games.delete(g.chatId);
  }
}

function persist(g) {
  try {
    const all = store.get('quiz-scores', {});
    const grp = (all[g.chatId] = all[g.chatId] || {});
    for (const [jid, s] of g.scores) {
      const k = ids.num(jid);
      const e = (grp[k] = grp[k] || { jid, name: s.name || k, pts: 0, wins: 0, quizzes: 0 });
      e.pts += s.pts;
      e.wins += s.wins;
      e.quizzes += 1;
      if (s.name) e.name = s.name;
      e.jid = jid;
    }
    store.save('quiz-scores');
  } catch (e) {
    console.error('[quiz] scores non sauvegardés:', e.message);
  }
}

/* ---------- commandes ---------- */

async function isAdminMsg(sock, msg) {
  try {
    const meta = await sock.groupMetadata(msg.key.remoteJid);
    return ids.isAdmin(ids.findParticipant(meta, ids.senderIds(sock, msg)));
  } catch (_) {
    return false;
  }
}

async function start(sock, msg, args) {
  const chatId = msg.key.remoteJid;
  if (games.has(chatId)) return reply(sock, msg, '⚠️ Un quiz est déjà en cours. *' + cfg.PREFIX + 'quizstop* pour l\'arrêter.');
  if (cfg.ADMIN_ONLY && !(await isAdminMsg(sock, msg))) return reply(sock, msg, '🔒 Seuls les admins peuvent lancer un quiz.');

  let count = cfg.DEFAULT_COUNT;
  let cat = null;
  for (const a of args) {
    if (/^\d+$/.test(a)) count = Math.min(cfg.MAX_COUNT, Math.max(1, parseInt(a, 10)));
    else {
      const c = source.resolveCategory(a);
      if (c === undefined) return reply(sock, msg, '❓ Catégorie inconnue : « ' + a + ' ». Tape *' + cfg.PREFIX + 'quizcat* pour voir la liste.');
      cat = c;
    }
  }

  const g = {
    chatId, sock, count, cat, scores: new Map(), starter: ids.senderIds(sock, msg),
    current: null, prefetch: null, stopped: false
  };
  games.set(chatId, g);
  await send(g, '🎮 *QUIZ !* ' + count + ' question' + (count > 1 ? 's' : '') + (cat ? ' — ' + source.CATEGORIES[cat] : ' — thèmes variés') +
    '\n\nRépondez directement dans le groupe, sans commande. Le premier à répondre juste gagne les points. C\'est parti dans 3 secondes !');
  await sleep(3000);
  runQuiz(g); // volontairement non attendu : la boucle tourne en arrière-plan
}

async function stop(sock, msg) {
  const g = games.get(msg.key.remoteJid);
  if (!g) return reply(sock, msg, 'Aucun quiz en cours.');
  bind(g, sock);
  const isStarter = ids.same(ids.senderIds(sock, msg), g.starter);
  if (!isStarter && !(await isAdminMsg(sock, msg))) return reply(sock, msg, '🔒 Seul celui qui a lancé le quiz ou un admin peut l\'arrêter.');
  g.stopped = true;
  if (g.current) {
    g.current.locked = true;
    g.current.finish();
  }
}

async function scores(sock, msg) {
  const all = store.get('quiz-scores', {});
  const grp = all[msg.key.remoteJid];
  const rows = grp ? Object.values(grp).sort((a, b) => b.pts - a.pts).slice(0, 10) : [];
  if (!rows.length) return reply(sock, msg, '📊 Aucun score enregistré pour ce groupe. Lance un quiz avec *' + cfg.PREFIX + 'quiz* !');
  const medals = ['🥇', '🥈', '🥉'];
  const text = '📊 *Classement général du groupe*\n\n' +
    rows.map((r, i) => (medals[i] || (i + 1) + '.') + ' ' + tag(r.jid) + ' — ' + r.pts + ' pts (' + r.wins + ' bonnes réponses, ' + r.quizzes + ' quiz)').join('\n');
  return reply(sock, msg, text, rows.map((r) => r.jid));
}

async function categories(sock, msg) {
  const lines = Object.entries(source.CATEGORIES).map(([k, v]) => '• ' + v + ' → *' + k + '*');
  return reply(sock, msg,
    '📚 *Catégories du quiz*\n\n' + lines.join('\n') +
    '\n\nExemples :\n' + cfg.PREFIX + 'quiz 10 cameroun\n' + cfg.PREFIX + 'quiz 5 anime\n' + cfg.PREFIX + 'quiz 15 (thèmes variés)');
}

/** Détecte la réponse de chaque membre pendant une question. Retourne true si le message était la bonne réponse. */
async function handleAnswer(sock, msg, text) {
  const g = games.get(msg.key.remoteJid);
  if (!g || !g.current || g.current.locked || msg.key.fromMe) return false;
  bind(g, sock);
  if (!text || text.length > 120) return false;
  if (!isCorrect(text, g.current.q)) return false;

  const set = ids.senderIds(sock, msg);
  const jid = msg.key.participant || [...set][0] + '@s.whatsapp.net';
  await onCorrect(g, msg, jid, msg.pushName);
  return true;
}

/** Annule les quiz possédés par une session qui vient de se déconnecter. */
async function abortSession(sessionId, fallbackSock) {
  const target = String(sessionId || '').split('@')[0].split(':')[0];
  if (!target) return;
  for (const [chatId, g] of [...games]) {
    if (groupOwner.sessionOf(g.sock) !== target) continue;
    if (fallbackSock) g.sock = fallbackSock;
    g.stopped = true;
    if (g.current) {
      g.current.locked = true;
      g.current.finish();
    } else {
      games.delete(chatId);
    }
  }
}

module.exports = { start, stop, scores, categories, handleAnswer, rebind, abortSession, _games: games };
