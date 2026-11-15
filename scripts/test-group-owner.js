'use strict';

/**
 * Test du routage multi-session (plusieurs comptes WhatsApp dans un groupe).
 * node scripts/test-group-owner.js
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
process.env.GROUP_OWNER_FILE = 'group-ownership-test';
process.env.GROUP_OWNER_STARTUP_MS = '0';
process.env.PREFIX = '.';
process.env.AV_AI = 'off';
process.env.AV_JUDGE = 'local';
process.env.AV_REGISTER_MS = '300';
process.env.AV_STATE_FILE = path.join(ROOT, 'storage', 'database', 'group-owner-test-av.json');

const db = require(path.join(ROOT, 'src/lib/database'));
const groupOwner = require(path.join(ROOT, 'src/core/group-owner'));
const av = require(path.join(ROOT, 'src/jeux/actionverite'));
const avGame = require(path.join(ROOT, 'src/jeux/actionverite/game'));
const { handleMessage } = require(path.join(ROOT, 'src/handlers/handler'));

const G = '120363000000000000@g.us';
const A = '237600000001';
const B = '237600000002';
const ADMIN = '237600000003';
const MEMBER = '237600000004';
const OWNER_FILE = path.join(ROOT, 'storage', 'database', 'group-ownership-test.json');

let botAdmin = { [A]: true, [B]: true };
const active = new Set([A, B]);

const meta = () => ({
  announce: false,
  participants: [
    { id: A + '@s.whatsapp.net', admin: botAdmin[A] ? 'admin' : null },
    { id: B + '@s.whatsapp.net', admin: botAdmin[B] ? 'admin' : null },
    { id: ADMIN + '@s.whatsapp.net', admin: 'superadmin' },
    { id: MEMBER + '@s.whatsapp.net', admin: null }
  ]
});

function makeSock(number) {
  const sent = [];
  return {
    number,
    sent,
    user: { id: number + ':12@s.whatsapp.net' },
    groupMetadata: async () => meta(),
    groupParticipantsUpdate: async () => [],
    groupSettingUpdate: async () => {},
    sendPresenceUpdate: async () => {},
    sendMessage: async (jid, content) => { sent.push(content); }
  };
}

const sockA = makeSock(A);
const sockB = makeSock(B);

const msg = (text, participant) => ({
  key: { remoteJid: G, participant: participant + '@s.whatsapp.net', fromMe: false, id: 'msg-' + Math.random() },
  message: { conversation: text }
});

let ok = 0, ko = 0;
const check = (name, cond) => { cond ? ok++ : ko++; console.log((cond ? 'OK  ' : 'ECHEC ') + name); };

function reset() {
  try { fs.unlinkSync(OWNER_FILE); } catch (_) {}
  try { fs.unlinkSync(process.env.AV_STATE_FILE); } catch (_) {}
  groupOwner._reset();
  av._games.clear();
  botAdmin = { [A]: true, [B]: true };
  active.clear();
  active.add(A).add(B);
  groupOwner.setRuntime({ isAlive: (id) => active.has(id), listActive: () => [...active] });
  groupOwner.invalidateMeta(G);
  sockA.sent.length = 0;
  sockB.sent.length = 0;
}

(async () => {
  const previousMode = db.getSetting('mode');
  db.setSetting('mode', 'public');

  // 1. Premier message : une seule session revendique le groupe.
  reset();
  check('A revendique le groupe', (await groupOwner.route(sockA, msg('bonjour', MEMBER), G)) === 'process');
  check('proprietaire = A', groupOwner.ownerOf(G) === A);
  check('B ignore le groupe', (await groupOwner.route(sockB, msg('bonjour', MEMBER), G)) === 'ignore');
  check('B ignore aussi .help', (await groupOwner.route(sockB, msg('.help', MEMBER), G)) === 'ignore');
  check('A traite .help', (await groupOwner.route(sockA, msg('.help', MEMBER), G)) === 'process');

  // 2. canRead (cache, anti-delete, autoread)
  check('canRead : A oui', groupOwner.canRead(sockA, G) === true);
  check('canRead : B non', groupOwner.canRead(sockB, G) === false);

  // 3. Transfert explicite via .claim
  check('A ignore .claim B', (await groupOwner.route(sockA, msg('.claim ' + B, ADMIN), G)) === 'ignore');
  check('B traite .claim B', (await groupOwner.route(sockB, msg('.claim ' + B, ADMIN), G)) === 'consumed');
  check('proprietaire = B', groupOwner.ownerOf(G) === B);
  check('A ignore apres transfert', (await groupOwner.route(sockA, msg('.help', MEMBER), G)) === 'ignore');
  check('B traite apres transfert', (await groupOwner.route(sockB, msg('.help', MEMBER), G)) === 'process');

  // 4. Un membre simple ne peut pas transferer.
  check('membre simple : .claim refuse', (await groupOwner.route(sockA, msg('.claim ' + A, MEMBER), G)) === 'ignore');
  check('proprietaire inchange', groupOwner.ownerOf(G) === B);

  // 5. Bascule si le proprietaire disparait.
  active.delete(B);
  groupOwner.markDown(B);
  check('reprise par A apres disparition', (await groupOwner.route(sockA, msg('bonjour', MEMBER), G)) === 'process');
  check('proprietaire = A (reprise)', groupOwner.ownerOf(G) === A);

  // 6. Priorite au bot admin : A non admin, B admin.
  reset();
  botAdmin[A] = false;
  groupOwner.invalidateMeta(G);
  check('bot non admin ne revendique pas', (await groupOwner.route(sockA, msg('bonjour', MEMBER), G)) === 'ignore');
  check('bot admin revendique', (await groupOwner.route(sockB, msg('bonjour', MEMBER), G)) === 'process');
  check('proprietaire = B (admin)', groupOwner.ownerOf(G) === B);

  // 7. Transfert refuse pendant une partie.
  reset();
  groupOwner.claim(G, A, { force: true });
  av._games.set(G, { fake: true });
  check('.claim refuse pendant une partie', (await groupOwner.route(sockB, msg('.claim ' + B, ADMIN), G)) === 'consumed');
  check('proprietaire reste A', groupOwner.ownerOf(G) === A);
  check('message explique la partie en cours', sockB.sent.some((c) => /partie est en cours/i.test(c.text || '')));
  av._games.clear();

  // 8. Evenements de groupe : seul le proprietaire les traite.
  reset();
  groupOwner.claim(G, A, { force: true });
  check('evenement : A oui', (await groupOwner.ensureForEvent(sockA, G)) === true);
  check('evenement : B non', (await groupOwner.ensureForEvent(sockB, G)) === false);

  // 9. Liberation d'une session.
  const freed = groupOwner.releaseSession(A, 'test');
  check('releaseSession libere le groupe', freed.includes(G) && !groupOwner.ownerOf(G));

  // 10. Integration handleMessage : un 2e socket ne peut pas voler la partie.
  reset();
  groupOwner.claim(G, A, { force: true });
  await handleMessage(sockA, msg('.start game', ADMIN));
  const game = av._games.get(G);
  check('partie lancee par A', !!game && game.sock === sockA);

  await handleMessage(sockB, msg('.jouer', MEMBER));
  check('B ne peut pas inscrire un joueur', !game || game.players.length === 0);

  await handleMessage(sockA, msg('.jouer', MEMBER));
  check('A inscrit le joueur', !!game && game.players.length === 1 && game.sock === sockA);

  await handleMessage(sockA, msg('.stop game', ADMIN));
  check('partie arretee proprement', !av._games.has(G));

  // Nettoyage
  db.setSetting('mode', previousMode || 'public');
  try { fs.unlinkSync(OWNER_FILE); } catch (_) {}
  try { fs.unlinkSync(process.env.AV_STATE_FILE); } catch (_) {}

  console.log('\n' + ok + ' OK / ' + ko + ' echec(s)');
  process.exit(ko ? 1 : 0);
})().catch((e) => {
  console.error(e);
  try { db.setSetting('mode', previousMode || 'public'); } catch (_) {}
  process.exit(1);
});
