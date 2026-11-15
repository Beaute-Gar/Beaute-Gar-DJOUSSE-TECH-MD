'use strict';

const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const ids = require('./ids');
const { detectChoice } = require('./choiceDetect');
const content = require('./content');
const judge = require('./judge');
const style = require('../../config/style');

const games = new Map(); // chatId -> game

const log = (...a) => console.log('[actionverite]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jidOf = (p) => p.jid;
const tag = (p) => '@' + ids.num(p.jid);
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

async function send(game, text, mentions) {
  try {
    await game.sock.sendMessage(game.chatId, { text, mentions: mentions || [] });
  } catch (e) {
    console.error('[actionverite] envoi impossible:', e.message);
  }
}

/* ---------- état persistant (pour restaurer les droits après un crash) ---------- */

function readState() {
  try {
    return JSON.parse(fs.readFileSync(cfg.STATE_FILE, 'utf8'));
  } catch (_) {
    return {};
  }
}
function writeState(s) {
  try {
    fs.mkdirSync(path.dirname(cfg.STATE_FILE), { recursive: true });
    fs.writeFileSync(cfg.STATE_FILE, JSON.stringify(s, null, 2));
  } catch (e) {
    console.error('[actionverite] état non sauvegardé:', e.message);
  }
}
function saveSnap(chatId, snap) {
  const s = readState();
  s[chatId] = snap;
  writeState(s);
}
function clearSnap(chatId) {
  const s = readState();
  delete s[chatId];
  writeState(s);
}

/** Restaure le réglage du groupe et rétrograde uniquement les joueurs promus.
 *  Retourne true seulement si tout a réussi : sinon l'instantané est conservé
 *  pour être rejoué à la prochaine connexion (recover). */
async function restoreRights(sock, chatId, snap) {
  let ok = true;
  let metaCache = null;

  // Un participant dont la promotion avait échoué n'est pas admin : le demote
  // peut alors renvoyer une erreur sans que la restauration soit en cause.
  const encoreAdmin = async (jid) => {
    if (!metaCache) {
      try {
        metaCache = await sock.groupMetadata(chatId);
      } catch (_) {
        return true; // métadonnées indisponibles : on considère l'échec réel
      }
    }
    const p = (metaCache.participants || []).find((x) => ids.same(ids.idsOf(x), ids.idsOf(jid)));
    return ids.isAdmin(p);
  };

  try {
    await sock.groupSettingUpdate(chatId, snap.announce ? 'announcement' : 'not_announcement');
  } catch (e) {
    ok = false;
    console.error('[actionverite] réglage du groupe non restauré:', e.message);
  }

  const list = snap.promoted || [];
  for (let i = 0; i < list.length; i += 20) {
    const batch = list.slice(i, i + 20);
    try {
      const res = await sock.groupParticipantsUpdate(chatId, batch, 'demote');
      // Baileys renvoie [{ status, jid }] ; on signale les échecs partiels.
      if (Array.isArray(res)) {
        for (const r of res) {
          if (r && r.status && String(r.status) !== '200' && (await encoreAdmin(r.jid))) {
            ok = false;
            console.error('[actionverite] rétrogradation refusée:', r.jid, r.status);
          }
        }
      }
    } catch (e) {
      ok = false;
      console.error('[actionverite] rétrogradation impossible:', e.message);
    }
  }

  return ok;
}

/** Réessaie la restauration (les refus WhatsApp sont souvent temporaires). */
async function restoreWithRetry(sock, chatId, snap, tries = 3) {
  for (let i = 0; i < tries; i++) {
    if (await restoreRights(sock, chatId, snap)) return true;
    if (i < tries - 1) await sleep(2000 * (i + 1));
  }
  return false;
}

/** À appeler quand la connexion s'ouvre : restaure les groupes laissés en plan par un crash. */
async function recover(sock) {
  const s = readState();
  for (const chatId of Object.keys(s)) {
    if (games.has(chatId)) continue;
    log('restauration après interruption :', chatId);
    const ok = await restoreWithRetry(sock, chatId, s[chatId]);
    if (ok) clearSnap(chatId);
    else console.error('[actionverite] restauration incomplète, nouvel essai à la prochaine connexion :', chatId);
  }
}

/* ---------- utilitaires de partie ---------- */

async function lookup(game, set) {
  let p = ids.findParticipant(game.meta, set);
  if (!p) {
    try {
      game.meta = await game.sock.groupMetadata(game.chatId);
      p = ids.findParticipant(game.meta, set);
    } catch (_) { /* ignoré */ }
  }
  return p;
}

function levelFrom(arg) {
  const a = String(arg || '').toLowerCase();
  if (['soft', 'doux', 'leger', 'léger'].includes(a)) return 'soft';
  if (['hot', 'chaud', 'coquin'].includes(a)) return 'hot';
  if (['extreme', 'extrême', 'ose', 'osé'].includes(a)) return 'extreme';
  return null;
}

function ranking(game) {
  const medals = ['👑', '🥈', '🥉'];
  return game.players
    .slice()
    .sort((a, b) => b.score - a.score)
    .map((p, i) => (medals[i] || (i + 1) + '.') + ' ' + tag(p) + ' — ' + p.score + ' pt' + (p.score > 1 ? 's' : ''))
    .join('\n');
}

/* ---------- commandes ---------- */

async function startGame(sock, msg, args) {
  const chatId = msg.key.remoteJid;
  const reply = (t, m) => sock.sendMessage(chatId, { text: t, mentions: m || [] }, { quoted: msg }).catch(() => {});

  if (games.has(chatId)) return reply(style.renderError(['Une partie est déjà en cours dans ce groupe.']));

  let meta;
  try {
    meta = await sock.groupMetadata(chatId);
  } catch (e) {
    return reply(style.renderError(['Impossible de lire les infos du groupe.']));
  }

  const senderP = ids.findParticipant(meta, ids.senderIds(sock, msg));
  if (!ids.isAdmin(senderP)) return reply(style.renderError(['Seuls les admins du groupe peuvent lancer une partie.']));

  const botP = ids.findParticipant(meta, ids.idsOf(sock.user));
  if (!ids.isAdmin(botP)) return reply(style.renderError(['Je dois être admin du groupe pour organiser la partie.']));

  const level = levelFrom(args[0]) || cfg.DEFAULT_LEVEL;
  const ownerP = meta.participants.find((p) => p.admin === 'superadmin') || null;
  const snapshot = {
    announce: !!meta.announce,
    owner: ownerP ? ownerP.id : null,
    admins: meta.participants.filter(ids.isAdmin).map((p) => p.id),
    promoted: []
  };
  saveSnap(chatId, snapshot);

  const game = {
    chatId,
    sock,
    meta,
    level,
    snapshot,
    players: [],
    skip: new Set(),
    turn: null,
    stopped: false,
    phase: 'INSCRIPTION',
    lastPlayer: null,
    regTimer: null
  };
  games.set(chatId, game);

  const lvlName = { soft: 'doux', hot: 'coquin', extreme: 'osé' }[level];
  const secs = Math.max(1, Math.round(cfg.REGISTER_MS / 1000));
  await send(
    game,
    style.box('ACTION OU VÉRITÉ', [
      'Niveau : ' + lvlName,
      'Tapez ' + cfg.PREFIX + 'jouer dans les ' + secs + ' secondes pour participer.'
    ])
  );
  game.regTimer = setTimeout(() => beginGame(game).catch((e) => abort(game, e)), cfg.REGISTER_MS);
}

async function register(sock, msg) {
  const chatId = msg.key.remoteJid;
  const game = games.get(chatId);
  const reply = (t, m) => sock.sendMessage(chatId, { text: t, mentions: m || [] }, { quoted: msg }).catch(() => {});
  if (!game) return reply(style.renderError(['Aucune partie en cours.', 'Un admin peut en lancer une avec ' + cfg.PREFIX + 'start game.']));
  game.sock = sock;
  if (game.phase !== 'INSCRIPTION') return reply(style.renderError(['Les inscriptions sont closes.']));

  const set = ids.senderIds(sock, msg);
  if (game.players.some((p) => ids.same(p.ids, set))) return;

  const part = await lookup(game, set);
  const jid = (part && part.id) || (msg.key.participant || msg.key.remoteJid);
  const player = { jid, ids: new Set([...set, ...ids.idsOf(part)]), score: 0 };
  if (ids.isAdmin(part)) player.wasAdmin = true;
  game.players.push(player);
  await send(game, style.renderSuccess([tag(player) + ' est inscrit(e). (' + game.players.length + ')']), [jidOf(player)]);
}

async function stopGame(sock, msg) {
  const chatId = msg.key.remoteJid;
  const game = games.get(chatId);
  const reply = (t) => sock.sendMessage(chatId, { text: t }, { quoted: msg }).catch(() => {});
  if (!game) return reply(style.renderError(['Aucune partie en cours.']));
  game.sock = sock;

  const meta = await sock.groupMetadata(chatId).catch(() => game.meta);
  const senderP = ids.findParticipant(meta, ids.senderIds(sock, msg));
  if (!ids.isAdmin(senderP)) return reply(style.renderError(['Seuls les admins peuvent arrêter la partie.']));

  game.stopped = true;
  if (game.phase === 'INSCRIPTION') {
    clearTimeout(game.regTimer);
    games.delete(chatId);
    clearSnap(chatId);
    return send(game, style.renderSuccess(['Partie annulée.']));
  }
  await send(game, style.renderInfo(['Partie arrêtée par un admin.']));
  endTurn(game);
}

/* ---------- déroulement ---------- */

async function beginGame(game) {
  if (game.stopped) return;
  if (game.players.length < cfg.MIN_PLAYERS) {
    games.delete(game.chatId);
    clearSnap(game.chatId);
    return send(
      game,
      style.renderError(['Partie annulée : il faut au moins ' + cfg.MIN_PLAYERS + ' joueurs inscrits (' + game.players.length + ' inscrit(s)).'])
    );
  }

  game.phase = 'MISE_EN_PLACE';
  const list = game.players.map((p, i) => (i + 1) + '. ' + tag(p));
  await send(
    game,
    style.box('PARTICIPANTS', [...list, 'La partie commence ! ' + cfg.ROUNDS + ' manches.']),
    game.players.map(jidOf)
  );

  // Un admin a pu arrêter la partie pendant l'annonce.
  if (game.stopped) {
    games.delete(game.chatId);
    clearSnap(game.chatId);
    return;
  }

  // Promotion temporaire des participants qui ne sont pas déjà admins
  const toPromote = game.players.filter((p) => !game.snapshot.admins.some((a) => ids.same(ids.idsOf(a), p.ids)));
  game.snapshot.promoted = toPromote.map(jidOf);
  saveSnap(game.chatId, game.snapshot);
  let echecs = 0;
  for (let i = 0; i < game.snapshot.promoted.length; i += 20) {
    const batch = game.snapshot.promoted.slice(i, i + 20);
    try {
      const res = await game.sock.groupParticipantsUpdate(game.chatId, batch, 'promote');
      if (Array.isArray(res)) {
        for (const r of res) {
          if (r && r.status && String(r.status) !== '200') {
            echecs++;
            console.error('[actionverite] promotion refusée:', r.jid, r.status);
          }
        }
      }
    } catch (e) {
      echecs += batch.length;
      console.error('[actionverite] promotion impossible:', e.message);
    }
  }
  if (echecs) throw new Error('promotion impossible pour ' + echecs + ' participant(s)');
  try {
    await game.sock.groupSettingUpdate(game.chatId, 'announcement');
  } catch (e) {
    console.error('[actionverite] mode muet impossible:', e.message);
  }
  await send(game, style.renderInfo(['Seuls les participants peuvent écrire pendant la partie.']));

  await runGame(game);
}

async function runGame(game) {
  game.phase = 'MANCHE';
  for (let r = 1; r <= cfg.ROUNDS && !game.stopped; r++) {
    game.round = r;
    const order = shuffle(game.players.slice());
    if (order.length > 1 && order[0] === game.lastPlayer) order.push(order.shift()); // pas deux fois de suite
    await send(game, style.renderInfo(['🔔 Manche ' + r + '/' + cfg.ROUNDS]));

    for (const p of order) {
      if (game.stopped) break;
      if (game.skip.has(p)) {
        game.skip.delete(p);
        await send(game, style.renderInfo(['Le tour de ' + tag(p) + ' est sauté (sanction).']), [jidOf(p)]);
        continue;
      }
      await playTurn(game, p);
      game.lastPlayer = p;
    }
  }
  await finish(game);
}

function playTurn(game, p) {
  return new Promise((resolve) => {
    game.turn = { player: p, phase: 'choice', kind: null, prompt: null, timer: null, resolve };
    send(
      game,
      style.box('À TOI DE JOUER', [tag(p) + ', choisis : Action ou Vérité ?']),
      [jidOf(p)]
    ).then(() => {
      const t = game.turn;
      if (!t || t.player !== p || t.phase !== 'choice') return;
      t.timer = setTimeout(() => timeout(game, p), cfg.CHOICE_MS);
    });
  });
}

function endTurn(game) {
  const t = game.turn;
  if (!t) return;
  clearTimeout(t.timer);
  game.turn = null;
  t.resolve();
}

async function timeout(game, p) {
  if (!game.turn || game.turn.player !== p) return;
  await send(game, style.renderError([tag(p) + ' n\'a pas répondu à temps : tour passé (0 pt).']), [jidOf(p)]);
  endTurn(game);
}

async function onChoice(game, p, kind) {
  const t = game.turn;
  clearTimeout(t.timer);
  t.phase = 'generating';
  t.kind = kind;

  const res = await content.get(kind, game.level, game.chatId);
  t.prompt = res.text;
  t.phase = 'answer';

  const secs = Math.max(1, Math.round(cfg.ANSWER_MS / 1000));
  await send(
    game,
    style.box(kind === 'truth' ? 'VÉRITÉ' : 'ACTION', [
      tag(p) + ' :',
      res.text,
      'Tu as ' + secs + ' secondes pour répondre.'
    ]),
    [jidOf(p)]
  );
  if (game.turn === t) t.timer = setTimeout(() => timeout(game, p), cfg.ANSWER_MS);
}

function hasMedia(msg) {
  const m = unwrap(msg.message) || {};
  return !!(m.audioMessage || m.videoMessage || m.imageMessage || m.stickerMessage);
}

async function onAnswer(game, p, msg, text) {
  const t = game.turn;
  clearTimeout(t.timer);
  t.phase = 'judging';

  let ok;
  if (t.kind === 'dare' && hasMedia(msg)) ok = true; // vocal / photo / vidéo = action réalisée
  else ok = (await judge.evaluate(t.kind, t.prompt, text)).ok;

  if (ok) {
    p.score += cfg.POINTS;
    await send(game, style.renderSuccess(['Bien joué ' + tag(p) + ' ! +' + cfg.POINTS + ' pts (total : ' + p.score + ')']), [jidOf(p)]);
  } else {
    await send(game, style.renderError(['Réponse jugée insuffisante, ' + tag(p) + '. 0 pt (total : ' + p.score + ')']), [jidOf(p)]);
  }
  endTurn(game);
}

async function sanction(game, p) {
  if (game.skip.has(p)) return;
  game.skip.add(p);
  await send(game, style.renderError([tag(p) + ' a répondu hors tour : son prochain tour est sauté.']), [jidOf(p)]);
}

async function finish(game) {
  game.phase = 'FIN';
  const heading = game.stopped ? 'CLASSEMENT PROVISOIRE' : 'CLASSEMENT FINAL';
  const title = game.stopped ? 'Classement provisoire :' : 'Classement final :';
  await send(game, style.box(heading, [title, ...ranking(game).split('\n')]), game.players.map(jidOf));

  const ok = await restoreWithRetry(game.sock, game.chatId, game.snapshot);
  if (ok) {
    clearSnap(game.chatId);
    await send(game, style.renderSuccess(['Les droits du groupe ont été restaurés.', 'Merci d\'avoir joué !']));
  } else {
    // L'instantané reste sur disque : recover() réessaiera à la prochaine connexion.
    await send(game, style.renderError([
      'Je n\'ai pas pu restaurer tous les droits.',
      'Je réessaierai à ma prochaine connexion.'
    ]));
  }

  games.delete(game.chatId);
}

async function abort(game, err) {
  console.error('[actionverite] erreur de partie:', err && err.message);
  game.stopped = true;
  endTurn(game);
  await send(game, style.renderError([
    'Partie interrompue : ' + ((err && err.message) || 'erreur interne'),
    'Les droits du groupe vont être restaurés.'
  ]));
  try {
    const ok = await restoreWithRetry(game.sock, game.chatId, game.snapshot);
    if (!ok) {
      console.error('[actionverite] restauration incomplète après erreur :', game.chatId);
      return;
    }
    clearSnap(game.chatId);
  } finally {
    games.delete(game.chatId);
  }
}

/**
 * Annule les parties possedees par une session qui vient de se deconnecter.
 * La restauration des droits utilise une autre session si elle est fournie.
 */
async function abortSession(sessionId, fallbackSock) {
  const target = ids.num(sessionId);
  if (!target) return;

  for (const [chatId, game] of [...games]) {
    const owner = game.sock && game.sock.user ? ids.num(game.sock.user.id) : '';
    if (owner !== target) continue;

    console.error('[actionverite] session deconnectee, partie annulee :', chatId);
    clearTimeout(game.regTimer);
    game.stopped = true;
    endTurn(game);

    const sock = fallbackSock || game.sock;
    try {
      await sock.sendMessage(chatId, {
        text: style.renderError([
          'Session déconnectée : la partie est annulée.',
          'Les droits du groupe sont restaurés.'
        ])
      });
    } catch (_) { /* socket indisponible */ }

    const ok = await restoreWithRetry(sock, chatId, game.snapshot);
    if (ok) clearSnap(chatId);
    games.delete(chatId);
  }
}

/* ---------- messages ---------- */

function unwrap(m) {
  let cur = m;
  for (let i = 0; i < 4 && cur; i++) {
    const inner =
      (cur.ephemeralMessage && cur.ephemeralMessage.message) ||
      (cur.viewOnceMessage && cur.viewOnceMessage.message) ||
      (cur.viewOnceMessageV2 && cur.viewOnceMessageV2.message) ||
      (cur.documentWithCaptionMessage && cur.documentWithCaptionMessage.message);
    if (!inner) break;
    cur = inner;
  }
  return cur;
}

function extractText(msg) {
  const m = unwrap(msg.message) || {};
  return String(
    m.conversation ||
      (m.extendedTextMessage && m.extendedTextMessage.text) ||
      (m.imageMessage && m.imageMessage.caption) ||
      (m.videoMessage && m.videoMessage.caption) ||
      ''
  ).trim();
}

/**
 * Traite le message du jeu (hors commandes). Retourne true si le message a été consommé.
 */
async function handleGameMessage(sock, msg, text) {
  const game = games.get(msg.key.remoteJid);
  if (!game) return false;
  game.sock = sock;
  const t = game.turn;
  if (!t || msg.key.fromMe) return false;

  const set = ids.senderIds(sock, msg);
  const player = game.players.find((p) => ids.same(p.ids, set));
  if (!player) return false;

  if (player === t.player) {
    if (t.phase === 'choice') {
      const choice = detectChoice(text);
      if (!choice) return false;
      await onChoice(game, player, choice);
      return true;
    }
    if (t.phase === 'answer') {
      await onAnswer(game, player, msg, text);
      return true;
    }
    return false;
  }

  // Un autre joueur inscrit se manifeste hors de son tour
  if ((t.phase === 'choice' && detectChoice(text)) || (t.phase === 'answer' && (text.length >= 2 || hasMedia(msg)))) {
    await sanction(game, player);
    return true;
  }
  return false;
}

module.exports = {
  startGame,
  register,
  stopGame,
  handleGameMessage,
  recover,
  abortSession,
  extractText,
  levelFrom,
  _games: games
};
