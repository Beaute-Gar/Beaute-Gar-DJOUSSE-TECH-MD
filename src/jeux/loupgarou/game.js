'use strict';

const cfg = require('./config');
const ids = require('../commun/ids');
const store = require('../commun/store');
const busy = require('../commun/busy');
const { sleep, shuffle, decorate } = require('../commun/text');
const groupOwner = require('../../core/group-owner');
const { ROLES, buildRoles } = require('./roles');

const games = new Map(); // chatId -> partie
const P = cfg.PREFIX;

const log = (...a) => console.log('[loup-garou]', ...a);
const tag = (p) => '@' + ids.num(p.jid);
const alive = (g) => g.players.filter((p) => p.alive);
const byNum = (g, n) => g.players.find((p) => p.num === n) || null;
const listText = (arr) => arr.map((p) => p.num + '. ' + p.name).join('\n');
const secs = (ms) => Math.max(1, Math.round(ms / 1000));
const roleOf = (p) => ROLES[p.role];

/** Garde le socket de la session propriétaire de la partie (jamais celui d'une autre session). */
function bind(g, sock) {
  if (!g || !sock) return;
  const current = groupOwner.sessionOf(g.sock);
  const next = groupOwner.sessionOf(sock);
  if (!current || !next || current === next) g.sock = sock;
}

/* ---------- envoi ---------- */

async function gsend(g, text, mentions) {
  try {
    await g.sock.sendMessage(g.chatId, { text: decorate(text), mentions: mentions || [] });
  } catch (e) {
    console.error('[loup-garou] envoi groupe impossible:', e.message);
  }
}

async function reply(sock, msg, text, mentions) {
  try {
    await sock.sendMessage(msg.key.remoteJid, { text: decorate(text), mentions: mentions || [] }, { quoted: msg });
  } catch (e) {
    console.error('[loup-garou] réponse impossible:', e.message);
  }
}

async function dm(g, p, text) {
  if (!p.dm) return false;
  for (let i = 0; i < 2; i++) {
    try {
      await g.sock.sendMessage(p.dm, { text: decorate(text) });
      return true;
    } catch (e) {
      console.error('[loup-garou] message privé impossible (' + p.name + '):', e.message);
      await sleep(300);
    }
  }
  return false;
}

/* ---------- pauses et questions privées ---------- */

function pause(g, ms) {
  return new Promise((resolve) => {
    if (g.stopped) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      g.wakers.delete(done);
      resolve();
    }
    g.wakers.add(done);
  });
}

function wakeAll(g) {
  for (const w of [...g.wakers]) w();
  for (const e of [...g.pending.values()]) e.resolve(null);
}

function numberValidator(options, allowZero) {
  return (t) => {
    const m = String(t).match(/\d+/);
    if (!m) return { ok: false, msg: 'Réponds avec un numéro de la liste.' };
    const n = parseInt(m[0], 10);
    if (n === 0 && allowZero) return { ok: true, value: 0 };
    if (options.includes(n)) return { ok: true, value: n };
    return { ok: false, msg: 'Numéro invalide. Choix possibles : ' + options.join(', ') + (allowZero ? ' (ou 0)' : '') };
  };
}

function pairValidator(options) {
  return (t) => {
    const ns = (String(t).match(/\d+/g) || []).map(Number).filter((n, i, a) => a.indexOf(n) === i);
    if (ns.length < 2 || !ns.slice(0, 2).every((n) => options.includes(n))) {
      return { ok: false, msg: 'Réponds avec deux numéros différents de la liste (exemple : 2 5).' };
    }
    return { ok: true, value: ns.slice(0, 2) };
  };
}

// Pose une question privée à un joueur ; résout avec la valeur validée ou null (délai dépassé / échec d'envoi)
function ask(g, p, text, spec, ms) {
  return new Promise((resolve) => {
    if (g.stopped) return resolve(null);
    const entry = { kind: spec.kind, options: spec.options || [], validate: spec.validate, done: false, timer: null };
    entry.resolve = (v) => {
      if (entry.done) return;
      entry.done = true;
      clearTimeout(entry.timer);
      if (g.pending.get(p) === entry) g.pending.delete(p);
      resolve(v);
    };
    g.pending.set(p, entry);
    dm(g, p, text).then((sent) => {
      if (entry.done) return;
      if (!sent) return entry.resolve(null);
      entry.timer = setTimeout(() => entry.resolve(null), ms);
    });
  });
}

// Ne laisse jamais une étape faire planter la partie
async function safe(name, fn) {
  try {
    return await fn();
  } catch (e) {
    console.error('[loup-garou] erreur (' + name + '):', e && e.stack ? e.stack : e);
    return null;
  }
}

/* ---------- réglages du groupe (fermeture la nuit) ---------- */

async function setAnnounce(g, on) {
  if (!g.canMute) return;
  try {
    if (on && !g.muteSaved) {
      const st = store.get('lg-state', {});
      st[g.chatId] = {
        announce: g.snapshotAnnounce,
        session: groupOwner.sessionOf(g.sock) || undefined
      };
      store.save('lg-state');
      g.muteSaved = true;
    }
    await g.sock.groupSettingUpdate(g.chatId, on ? 'announcement' : 'not_announcement');
  } catch (e) {
    console.error('[loup-garou] réglage du groupe impossible:', e.message);
    g.canMute = false;
  }
}

/** À appeler à l'ouverture de la connexion : rouvre les groupes restés fermés après un crash. */
async function recover(sock) {
  const me = groupOwner.sessionOf(sock);
  if (me) {
    for (const g of games.values()) {
      if (groupOwner.sessionOf(g.sock) === me) g.sock = sock;
    }
  }
  const st = store.get('lg-state', {});
  let changed = false;
  for (const chatId of Object.keys(st)) {
    if (games.has(chatId)) continue;
    // Chaque session ne restaure que les groupes qu'elle avait fermés.
    if (me && st[chatId] && st[chatId].session && st[chatId].session !== me) continue;
    try {
      await sock.groupSettingUpdate(chatId, st[chatId].announce ? 'announcement' : 'not_announcement');
    } catch (e) {
      console.error('[loup-garou] restauration impossible:', e.message);
    }
    delete st[chatId];
    changed = true;
  }
  if (changed) store.save('lg-state');
}

/* ---------- salon d'inscription ---------- */

function makePlayer(g, msg, part) {
  const set = ids.senderIds(g.sock, msg);
  const jid = (part && part.id) || msg.key.participant || [...set][0] + '@s.whatsapp.net';
  const nm = msg.pushName || (part && (part.notify || part.name)) || '+' + ids.num(jid);
  return {
    jid,
    dm: ids.dmJid(part, msg.key.participant),
    ids: new Set([...set, ...ids.idsOf(part)]),
    name: String(nm).slice(0, 25),
    role: null, alive: true, lover: null, num: 0
  };
}

async function open(sock, msg) {
  const chatId = msg.key.remoteJid;
  if (games.has(chatId)) return reply(sock, msg, '⚠️ Une partie de Loup-Garou est déjà ouverte ici. Tape *' + P + 'lg join* pour la rejoindre.');
  let meta;
  try {
    meta = await sock.groupMetadata(chatId);
  } catch (_) {
    return reply(sock, msg, '❌ Impossible de lire les infos du groupe.');
  }
  const botP = ids.findParticipant(meta, ids.idsOf(sock.user));
  const g = {
    chatId, sock, meta, phase: 'LOBBY', players: [], pending: new Map(), votes: new Map(), wakers: new Set(),
    stopped: false, night: 0, witch: { heal: true, kill: true }, over: null,
    canMute: cfg.MUTE_NIGHT && ids.isAdmin(botP), snapshotAnnounce: !!meta.announce, muteSaved: false,
    hostIds: ids.senderIds(sock, msg), lobbyTimer: null, voteDone: null
  };
  games.set(chatId, g);
  const host = makePlayer(g, msg, ids.findParticipant(meta, g.hostIds));
  g.players.push(host);

  await gsend(g,
    '🐺 *LOUP-GAROU* — le jeu du village maudit !\n\n' +
      tag(host) + ' ouvre une partie. Tapez *' + P + 'lg join* pour participer (' + cfg.MIN_PLAYERS + ' à ' + cfg.MAX_PLAYERS + ' joueurs).\n' +
      '⏳ Début automatique dans ' + secs(cfg.LOBBY_MS) + ' secondes, ou plus tôt avec *' + P + 'lg go*.\n\n' +
      '📩 Les rôles sont envoyés en *message privé* : si tu n\'as jamais écrit au bot, envoie-lui « salut » en privé avant le début.\n' +
      (g.canMute ? '🌙 Le groupe sera fermé chaque nuit.' : '⚠️ Le bot n\'est pas admin : le groupe ne sera pas fermé la nuit, jouez fair-play (silence la nuit !).'),
    [host.jid]);
  g.lobbyTimer = setTimeout(() => begin(g).catch((e) => abort(g, e)), cfg.LOBBY_MS);
}

async function join(sock, msg) {
  const g = games.get(msg.key.remoteJid);
  if (!g) return reply(sock, msg, 'Aucune partie ouverte. Tape *' + P + 'lg* pour en créer une.');
  bind(g, sock);
  if (g.phase !== 'LOBBY') return reply(sock, msg, '⏱️ La partie a déjà commencé.');
  const set = ids.senderIds(sock, msg);
  if (g.players.some((p) => ids.same(p.ids, set))) return reply(sock, msg, 'Tu es déjà inscrit(e) 😉');
  if (g.players.length >= cfg.MAX_PLAYERS) return reply(sock, msg, '🚫 La partie est complète (' + cfg.MAX_PLAYERS + ' joueurs).');
  let part = ids.findParticipant(g.meta, set);
  if (!part) {
    try {
      g.meta = await sock.groupMetadata(g.chatId);
      part = ids.findParticipant(g.meta, set);
    } catch (_) { /* ignoré */ }
  }
  const p = makePlayer(g, msg, part);
  g.players.push(p);
  await gsend(g, '✅ ' + tag(p) + ' rejoint la partie (' + g.players.length + ' joueur' + (g.players.length > 1 ? 's' : '') + ').', [p.jid]);
}

async function leave(sock, msg) {
  const g = games.get(msg.key.remoteJid);
  if (!g || g.phase !== 'LOBBY') return reply(sock, msg, 'Tu ne peux quitter que pendant les inscriptions.');
  const set = ids.senderIds(sock, msg);
  const i = g.players.findIndex((p) => ids.same(p.ids, set));
  if (i < 0) return;
  const [p] = g.players.splice(i, 1);
  await gsend(g, '👋 ' + tag(p) + ' quitte la partie.', [p.jid]);
}

async function isAdminMsg(sock, msg) {
  try {
    const meta = await sock.groupMetadata(msg.key.remoteJid);
    return ids.isAdmin(ids.findParticipant(meta, ids.senderIds(sock, msg)));
  } catch (_) {
    return false;
  }
}

async function go(sock, msg) {
  const g = games.get(msg.key.remoteJid);
  if (!g) return reply(sock, msg, 'Aucune partie ouverte.');
  bind(g, sock);
  if (g.phase !== 'LOBBY') return reply(sock, msg, 'La partie est déjà lancée.');
  if (!ids.same(ids.senderIds(sock, msg), g.hostIds) && !(await isAdminMsg(sock, msg))) {
    return reply(sock, msg, '🔒 Seul celui qui a ouvert la partie ou un admin peut la lancer.');
  }
  await begin(g).catch((e) => abort(g, e));
}

async function stop(sock, msg) {
  const g = games.get(msg.key.remoteJid);
  if (!g) return reply(sock, msg, 'Aucune partie en cours.');
  bind(g, sock);
  if (!ids.same(ids.senderIds(sock, msg), g.hostIds) && !(await isAdminMsg(sock, msg))) {
    return reply(sock, msg, '🔒 Seul celui qui a ouvert la partie ou un admin peut l\'arrêter.');
  }
  if (g.phase === 'LOBBY') {
    clearTimeout(g.lobbyTimer);
    games.delete(g.chatId);
    return gsend(g, '🛑 Partie annulée.');
  }
  g.stopped = true;
  wakeAll(g); // runGame se termine proprement et restaure le groupe
}

async function status(sock, msg) {
  const g = games.get(msg.key.remoteJid);
  if (!g) return reply(sock, msg, 'Aucune partie en cours. Tape *' + P + 'lg* pour en créer une.');
  const list = g.phase === 'LOBBY'
    ? g.players.map((p, i) => (i + 1) + '. ' + p.name).join('\n')
    : alive(g).map((p) => p.num + '. ' + p.name).join('\n');
  return reply(sock, msg, '📋 *Loup-Garou* — phase : ' + g.phase + (g.night ? ' (nuit ' + g.night + ')' : '') + '\n' +
    (g.phase === 'LOBBY' ? 'Inscrits' : 'En vie') + ' :\n' + list);
}

function help(sock, msg) {
  const lines = Object.values(ROLES).map((r) => r.emoji + ' *' + r.label + '* — ' + r.desc);
  return reply(sock, msg,
    '🐺 *LOUP-GAROU — règles*\n\n' + lines.join('\n\n') +
      '\n\n🌙 *Nuit* : cupidon (nuit 1), voyante, loups puis sorcière agissent en privé avec le bot.\n' +
      '☀️ *Jour* : discussion puis vote avec *' + P + 'vote <numéro>*. Le village élimine le plus voté (égalité = personne).\n' +
      '🏆 Le village gagne si tous les loups sont morts ; les loups gagnent s\'ils sont aussi nombreux que les autres.\n\n' +
      '*Commandes* : ' + P + 'lg, ' + P + 'lg join, ' + P + 'lg leave, ' + P + 'lg go, ' + P + 'lg stop, ' + P + 'lg status, ' + P + 'vote N.\n' +
      'En privé, écris *role* au bot pour revoir ton rôle.');
}

/* ---------- début de partie ---------- */

function roleCard(g, p) {
  const r = roleOf(p);
  let t = r.emoji + ' *Tu es ' + r.label + '* (joueur n°' + p.num + ')\n\n' + r.desc;
  if (p.role === 'loup') {
    const mates = g.players.filter((x) => x.role === 'loup' && x !== p).map((x) => x.name);
    t += '\n\n🐺 Tes compagnons loups : ' + (mates.length ? mates.join(', ') : 'aucun, tu es seul(e) !');
  }
  return t + '\n\n_Écris « role » ici pour revoir cette carte._';
}

async function begin(g) {
  if (g.phase !== 'LOBBY') return;
  clearTimeout(g.lobbyTimer);
  if (g.players.length < cfg.MIN_PLAYERS) {
    games.delete(g.chatId);
    return gsend(g, '😕 Partie annulée : il faut au moins ' + cfg.MIN_PLAYERS + ' joueurs (' + g.players.length + ' inscrit(s)).');
  }
  g.phase = 'START';
  shuffle(g.players);
  const roles = shuffle(buildRoles(g.players.length));
  g.players.forEach((p, i) => { p.role = roles[i]; p.num = i + 1; p.alive = true; p.lover = null; });

  const failed = [];
  for (const p of g.players) {
    if (!(await dm(g, p, roleCard(g, p)))) failed.push(p);
  }
  if (failed.length) {
    games.delete(g.chatId);
    return gsend(g,
      '❌ Partie annulée : impossible d\'envoyer le rôle en privé à ' + failed.map(tag).join(', ') +
        '.\nCes joueurs doivent d\'abord écrire « salut » au bot en privé, puis on relance avec *' + P + 'lg*.',
      failed.map((p) => p.jid));
  }

  const count = {};
  g.players.forEach((p) => { count[p.role] = (count[p.role] || 0) + 1; });
  const comp = Object.entries(count).map(([k, n]) => n + ' ' + ROLES[k].emoji + ' ' + ROLES[k].label).join(', ');
  busy.mark(g.chatId);
  await gsend(g,
    '🚀 *La partie commence !* ' + g.players.length + ' joueurs.\n\n' + listText(g.players) +
      '\n\n🎭 Rôles en jeu : ' + comp + '\n📩 Chacun a reçu son rôle en privé.', g.players.map((p) => p.jid));
  runGame(g).catch((e) => console.error('[loup-garou] erreur fatale:', e && e.message)); // en arrière-plan : ne bloque pas le handler
}

/* ---------- mort, victoire ---------- */

function eliminate(g, p, cause) {
  const out = [];
  const queue = [[p, cause]];
  while (queue.length) {
    const [x, c] = queue.shift();
    if (!x.alive) continue;
    x.alive = false;
    out.push({ p: x, cause: c });
    if (x.lover && x.lover.alive) queue.push([x.lover, 'chagrin']);
  }
  return out;
}

const CAUSE = {
  loups: 'a été dévoré(e) par les loups',
  poison: 'a été empoisonné(e) par la sorcière',
  vote: 'a été éliminé(e) par le village',
  chagrin: 'est mort(e) de chagrin',
  chasseur: 'a été abattu(e) par le chasseur'
};

async function announceDeaths(g, deaths, header) {
  const lines = deaths.map((d) =>
    '💀 ' + tag(d.p) + ' ' + CAUSE[d.cause] + (cfg.REVEAL_ROLES ? ' — c\'était *' + roleOf(d.p).label + '* ' + roleOf(d.p).emoji : ''));
  await gsend(g, (header ? header + '\n\n' : '') + lines.join('\n'), deaths.map((d) => d.p.jid));
}

async function hunterShots(g, deaths) {
  const out = [];
  for (const d of deaths) {
    const h = d.p;
    if (h.role !== 'chasseur' || h.shot) continue;
    h.shot = true;
    const options = alive(g).map((p) => p.num);
    if (!options.length) continue;
    await gsend(g, '🏹 ' + tag(h) + ' était le *Chasseur* : il a ' + secs(cfg.HUNTER_MS) + ' secondes pour tirer sa dernière balle !', [h.jid]);
    const r = await ask(g, h,
      '🏹 Tu es mort(e) ! Choisis la personne que tu emportes avec toi :\n' + listText(alive(g)),
      { kind: 'hunter', options, validate: numberValidator(options, false) }, cfg.HUNTER_MS);
    const target = r ? byNum(g, r) : null;
    if (!target || !target.alive) {
      await gsend(g, '🏹 Le chasseur n\'a tiré sur personne : la balle se perd.');
      continue;
    }
    const killed = eliminate(g, target, 'chasseur');
    await announceDeaths(g, killed, '🏹 Coup de feu !');
    out.push(...killed);
    out.push(...(await hunterShots(g, killed)));
  }
  return out;
}

function checkWin(g) {
  const al = alive(g);
  if (!al.length) return 'personne';
  const wolves = al.filter((p) => p.role === 'loup').length;
  if (al.length === 2 && al[0].lover === al[1] && (al[0].role === 'loup') !== (al[1].role === 'loup')) return 'amoureux';
  if (wolves === 0) return 'village';
  if (wolves >= al.length - wolves) return 'loups';
  return null;
}

/* ---------- la nuit ---------- */

async function stepCupidon(g) {
  const c = g.players.find((p) => p.role === 'cupidon' && p.alive);
  if (!c) return;
  const options = g.players.map((p) => p.num);
  const res = await ask(g, c,
    '💘 *Cupidon*, désigne les deux amoureux.\n' + listText(g.players) + '\n\nRéponds avec deux numéros différents (exemple : 2 5).',
    { kind: 'cupid', options, validate: pairValidator(options) }, cfg.STEP_MS);
  const pair = res || shuffle(options.slice()).slice(0, 2);
  const a = byNum(g, pair[0]);
  const b = byNum(g, pair[1]);
  if (!a || !b || a === b) return;
  a.lover = b;
  b.lover = a;
  await dm(g, a, '💘 Tu es désormais *amoureux(se)* de ' + b.name + ' (n°' + b.num + '). Si l\'un de vous meurt, l\'autre meurt de chagrin.');
  await dm(g, b, '💘 Tu es désormais *amoureux(se)* de ' + a.name + ' (n°' + a.num + '). Si l\'un de vous meurt, l\'autre meurt de chagrin.');
}

async function stepSeer(g) {
  const s = g.players.find((p) => p.role === 'voyante' && p.alive);
  if (!s) return;
  const options = alive(g).filter((p) => p !== s).map((p) => p.num);
  if (!options.length) return;
  const res = await ask(g, s,
    '🔮 *Voyante*, de qui veux-tu connaître le rôle ?\n' + listText(alive(g).filter((p) => p !== s)),
    { kind: 'seer', options, validate: numberValidator(options, false) }, cfg.STEP_MS);
  const t = res ? byNum(g, res) : null;
  if (t) await dm(g, s, '🔮 ' + t.name + ' (n°' + t.num + ') est : ' + roleOf(t).emoji + ' *' + roleOf(t).label + '*');
}

async function stepWolves(g) {
  const wolves = alive(g).filter((p) => p.role === 'loup');
  if (!wolves.length) return null;
  const targets = alive(g).filter((p) => p.role !== 'loup');
  if (!targets.length) return null;
  const options = targets.map((p) => p.num);
  const votes = new Map();
  await Promise.all(wolves.map((w) => safe('loup', async () => {
    const mates = wolves.filter((x) => x !== w).map((x) => x.name);
    const r = await ask(g, w,
      '🐺 *Nuit ' + g.night + '* — qui dévorer ?\n' + listText(targets) +
        '\n\nTes compagnons : ' + (mates.length ? mates.join(', ') : 'aucun') + '\nRéponds avec un numéro.',
      { kind: 'wolf', options, validate: numberValidator(options, false) }, cfg.STEP_MS);
    if (r) votes.set(w, r);
  })));
  if (!votes.size) return null;
  const tally = new Map();
  for (const n of votes.values()) tally.set(n, (tally.get(n) || 0) + 1);
  const max = Math.max(...tally.values());
  const top = [...tally.entries()].filter(([, c]) => c === max).map(([n]) => n);
  const victim = byNum(g, top[Math.floor(Math.random() * top.length)]);
  for (const w of wolves) await dm(g, w, '🐺 La meute a choisi de dévorer ' + victim.name + ' (n°' + victim.num + ').');
  return victim;
}

async function stepWitch(g, state) {
  const w = g.players.find((p) => p.role === 'sorciere' && p.alive);
  if (!w || (!g.witch.heal && !g.witch.kill)) return;

  if (g.witch.heal && state.victim) {
    const v = state.victim;
    const r = await ask(g, w,
      '🧪 *Sorcière* — les loups ont attaqué ' + v.name + ' (n°' + v.num + ') cette nuit.\nVeux-tu le/la *sauver* avec ta potion de vie ?\nRéponds *1* pour oui, *0* pour non.',
      { kind: 'witch_heal', options: [1], validate: numberValidator([1], true) }, cfg.STEP_MS);
    if (r === 1) {
      state.saved = true;
      g.witch.heal = false;
      await dm(g, w, '✅ Potion de vie utilisée : ' + v.name + ' est sauvé(e).');
    }
  }
  if (g.witch.kill) {
    const others = alive(g).filter((p) => p !== w);
    const options = others.map((p) => p.num);
    if (options.length) {
      const r = await ask(g, w,
        '☠️ *Sorcière* — veux-tu *empoisonner* quelqu\'un avec ta potion de mort ?\n' + listText(others) + '\n\nRéponds avec un numéro, ou *0* pour ne rien faire.',
        { kind: 'witch_kill', options, validate: numberValidator(options, true) }, cfg.STEP_MS);
      const t = r ? byNum(g, r) : null;
      if (t) {
        state.poisoned = t;
        g.witch.kill = false;
        await dm(g, w, '☠️ Potion de mort utilisée sur ' + t.name + '.');
      }
    }
  }
}

async function night(g) {
  g.phase = 'NUIT';
  g.night += 1;
  await setAnnounce(g, true);
  await gsend(g, '🌙 *Nuit ' + g.night + '* — le village s\'endort...\n' +
    (g.canMute ? '🔇 Le groupe est fermé pour la nuit. ' : '🤫 Silence dans le groupe jusqu\'au matin. ') +
    'Les rôles actifs reçoivent un message privé du bot.');

  const state = { victim: null, saved: false, poisoned: null };
  const tasks = [];
  if (g.night === 1) tasks.push(safe('cupidon', () => stepCupidon(g)));
  tasks.push(safe('voyante', () => stepSeer(g)));
  tasks.push(safe('loups', async () => { state.victim = await stepWolves(g); }));
  await Promise.all(tasks);
  if (g.stopped) return;
  await safe('sorcière', () => stepWitch(g, state));
  if (g.stopped) return;

  // Aube
  g.phase = 'AUBE';
  await setAnnounce(g, g.snapshotAnnounce);
  let deaths = [];
  if (state.victim && !state.saved) deaths.push(...eliminate(g, state.victim, 'loups'));
  if (state.poisoned && state.poisoned.alive) deaths.push(...eliminate(g, state.poisoned, 'poison'));

  if (!deaths.length) {
    await gsend(g, '☀️ *Le jour se lève sur le village.* Miracle : personne n\'est mort cette nuit !');
  } else {
    await announceDeaths(g, deaths, '☀️ *Le jour se lève sur le village...*');
    deaths = deaths.concat(await hunterShots(g, deaths));
  }
  g.over = checkWin(g);
}

/* ---------- le jour ---------- */

function allVoted(g) {
  return alive(g).every((p) => g.votes.has(p));
}

function waitVotes(g) {
  return new Promise((resolve) => {
    const t = setTimeout(done, cfg.VOTE_MS);
    function done() {
      clearTimeout(t);
      g.voteDone = null;
      g.wakers.delete(done);
      resolve();
    }
    g.voteDone = done;
    g.wakers.add(done);
  });
}

async function day(g) {
  g.phase = 'JOUR';
  await gsend(g,
    '🗣️ *Jour ' + g.night + ' — Discussion* (' + secs(cfg.DAY_MS) + ' s)\n\nJoueurs en vie :\n' + listText(alive(g)) +
      '\n\nDébattez : qui est un loup-garou ? Les morts ne parlent plus 👻');
  await pause(g, cfg.DAY_MS);
  if (g.stopped) return;

  g.phase = 'VOTE';
  g.votes = new Map();
  await gsend(g,
    '🗳️ *Vote du village* (' + secs(cfg.VOTE_MS) + ' s)\nTape *' + P + 'vote <numéro>* (ou *' + P + 'vote 0* pour t\'abstenir).\n\n' + listText(alive(g)));
  await waitVotes(g);
  if (g.stopped) return;

  g.phase = 'RESULTAT';
  const tally = new Map();
  for (const n of g.votes.values()) if (n > 0) tally.set(n, (tally.get(n) || 0) + 1);
  if (!tally.size) {
    await gsend(g, '🤷 Personne n\'a voté : aucune élimination aujourd\'hui.');
    return;
  }
  const rows = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  await gsend(g, '📊 *Résultat du vote*\n' + rows.map(([n, c]) => n + '. ' + byNum(g, n).name + ' — ' + c + ' voix').join('\n'));
  const max = rows[0][1];
  const top = rows.filter(([, c]) => c === max);
  if (top.length > 1) {
    await gsend(g, '⚖️ Égalité : personne n\'est éliminé aujourd\'hui.');
    return;
  }
  const target = byNum(g, top[0][0]);
  let deaths = eliminate(g, target, 'vote');
  await announceDeaths(g, deaths, '⚰️ Le village a tranché...');
  deaths = deaths.concat(await hunterShots(g, deaths));
  g.over = checkWin(g);
}

/* ---------- boucle principale ---------- */

async function runGame(g) {
  try {
    while (!g.stopped && !g.over) {
      await night(g);
      if (g.stopped || g.over) break;
      await day(g);
    }
  } catch (e) {
    console.error('[loup-garou] erreur de partie:', e && e.stack ? e.stack : e);
    await gsend(g, '⚠️ Une erreur est survenue, la partie s\'arrête.');
  } finally {
    await endGame(g);
  }
}

async function endGame(g) {
  try {
    g.phase = 'FIN';
    const msgs = {
      village: '🎉 *VICTOIRE DU VILLAGE !* Tous les loups-garous ont été éliminés.',
      loups: '🐺 *VICTOIRE DES LOUPS-GAROUS !* Le village est tombé.',
      amoureux: '💘 *VICTOIRE DES AMOUREUX !* Ils sont les derniers en vie.',
      personne: '☠️ Tout le monde est mort : personne ne gagne.'
    };
    const reveal = g.players.map((p) => roleOf(p).emoji + ' ' + p.name + ' — ' + roleOf(p).label + (p.alive ? '' : ' 💀')).join('\n');
    await gsend(g, (g.over ? msgs[g.over] : '🛑 Partie arrêtée.') + '\n\n*Rôles de la partie :*\n' + reveal);
    await setAnnounce(g, g.snapshotAnnounce);
    if (g.canMute || g.muteSaved) {
      const st = store.get('lg-state', {});
      delete st[g.chatId];
      store.save('lg-state');
    }
  } catch (e) {
    console.error('[loup-garou] fin de partie:', e.message);
  } finally {
    wakeAll(g);
    busy.unmark(g.chatId);
    games.delete(g.chatId);
  }
}

async function abort(g, err) {
  console.error('[loup-garou] erreur:', err && err.stack ? err.stack : err);
  g.stopped = true;
  wakeAll(g);
  if (g.phase === 'LOBBY' || g.phase === 'START') {
    clearTimeout(g.lobbyTimer);
    games.delete(g.chatId);
    busy.unmark(g.chatId);
  }
}

/* ---------- votes (groupe) et messages privés ---------- */

async function vote(sock, msg, args) {
  const g = games.get(msg.key.remoteJid);
  if (!g || g.phase !== 'VOTE') return false;
  bind(g, sock);
  const p = g.players.find((x) => ids.same(x.ids, ids.senderIds(sock, msg)));
  if (!p) { await reply(sock, msg, 'Tu ne participes pas à cette partie.'); return true; }
  if (!p.alive) { await reply(sock, msg, 'Les morts ne votent pas 👻'); return true; }
  const n = parseInt(args[0], 10);
  if (!Number.isFinite(n) || n < 0) { await reply(sock, msg, 'Utilisation : *' + P + 'vote <numéro>* (0 pour s\'abstenir).'); return true; }
  if (n === 0) {
    g.votes.set(p, 0);
    await reply(sock, msg, '🗳️ Abstention enregistrée.');
  } else {
    const t = byNum(g, n);
    if (!t || !t.alive) { await reply(sock, msg, 'Numéro invalide : choisis un joueur en vie.'); return true; }
    g.votes.set(p, n);
    await reply(sock, msg, '🗳️ Vote enregistré pour *' + t.name + '* (n°' + n + ').');
  }
  if (allVoted(g) && g.voteDone) g.voteDone();
  return true;
}

async function handlePrivate(sock, msg, text) {
  if (!games.size || msg.key.fromMe) return false;
  const me = groupOwner.sessionOf(sock);
  const set = ids.senderIds(sock, msg);
  for (const g of games.values()) {
    const owner = groupOwner.sessionOf(g.sock);
    if (me && owner && owner !== me) continue;
    const p = g.players.find((x) => ids.same(x.ids, set));
    if (!p) continue;
    bind(g, sock);
    const entry = g.pending.get(p);
    if (entry && !entry.done) {
      const r = entry.validate(text);
      if (r.ok) {
        entry.resolve(r.value);
        await dm(g, p, '✅ Choix enregistré.');
      } else {
        await dm(g, p, r.msg);
      }
      return true;
    }
    if (p.role && /^(role|rôle|mon role|mon rôle)$/i.test(text.trim())) {
      await dm(g, p, roleCard(g, p) + (p.alive ? '' : '\n\n💀 Tu es mort(e).'));
      return true;
    }
  }
  return false;
}

/** Annule les parties possédées par une session qui vient de se déconnecter. */
async function abortSession(sessionId, fallbackSock) {
  const target = String(sessionId || '').split('@')[0].split(':')[0];
  if (!target) return;
  for (const g of [...games.values()]) {
    if (groupOwner.sessionOf(g.sock) !== target) continue;
    if (fallbackSock) g.sock = fallbackSock;
    g.stopped = true;
    wakeAll(g);
    if (g.phase === 'LOBBY' || g.phase === 'START') {
      clearTimeout(g.lobbyTimer);
      games.delete(g.chatId);
      busy.unmark(g.chatId);
    }
  }
}

module.exports = { open, join, leave, go, stop, status, help, vote, handlePrivate, recover, abortSession, _games: games };
