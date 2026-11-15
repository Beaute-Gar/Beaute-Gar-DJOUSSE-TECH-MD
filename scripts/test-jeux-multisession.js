'use strict';

/**
 * Vérifie l'intégration multi-session des jeux :
 *   node scripts/test-jeux-multisession.js
 *
 * Deux comptes du bot sont dans le même groupe. Une seule session doit traiter
 * le groupe (quiz, loup-garou, mode nuit) ; les messages privés d'une partie
 * ouverte par l'autre session doivent être ignorés.
 */
process.env.AV_AI = 'off';
process.env.GAMES_AI = 'off';
process.env.QUIZ_SOURCE = 'local';
process.env.GROUP_OWNER_FILE = 'group-ownership-jeux-test';
process.env.GROUP_OWNER_STARTUP_MS = '0';
process.env.GROUP_OWNER_GRACE_MS = '0';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const groupOwner = require(path.join(ROOT, 'src/core/group-owner'));
const jeux = require(path.join(ROOT, 'src/jeux'));
const lg = require(path.join(ROOT, 'src/jeux/loupgarou'));
const nuit = require(path.join(ROOT, 'src/groupe/modenuit'));
const store = require(path.join(ROOT, 'src/jeux/commun/store'));

const G = '1204@g.us';
const A = '237699999901@s.whatsapp.net';
const B = '237699999902@s.whatsapp.net';
const P = (i) => '2376000000' + String(i).padStart(2, '0') + '@s.whatsapp.net';

const meta = {
  announce: false,
  participants: [
    { id: A, admin: 'admin' },
    { id: B, admin: 'admin' },
    { id: P(1), admin: 'superadmin' },
    { id: P(2) }, { id: P(3) }, { id: P(4) }, { id: P(5) }
  ]
};

const clean = (t) => String(t || '').replace(/[╭╰┄『』❍│✦⪼]/g, ' ').replace(/\s+/g, ' ').trim();

function makeSock(id) {
  const s = { id, group: [], dms: [], settings: [] };
  s.user = { id: id + ':1@s.whatsapp.net' };
  s.groupMetadata = async () => meta;
  s.groupSettingUpdate = async (g, v) => { s.settings.push(v); };
  s.sendMessage = async (jid, m) => {
    if (String(jid).endsWith('@g.us')) s.group.push(clean(m.text));
    else s.dms.push({ to: jid, text: clean(m.text) });
  };
  return s;
}

const sockA = makeSock('237699999901');
const sockB = makeSock('237699999902');

const groupMsg = (from, text) => ({ key: { remoteJid: G, participant: from, fromMe: false }, pushName: 'J' + from.slice(-2), message: { conversation: text } });
const privateMsg = (from, text) => ({ key: { remoteJid: from, fromMe: false }, pushName: 'J', message: { conversation: text } });

/** Reproduit exactement la porte du handler : seul le propriétaire du groupe continue. */
async function dispatch(sock, msg) {
  const jid = msg.key.remoteJid;
  if (jid.endsWith('@g.us')) {
    const verdict = await groupOwner.route(sock, msg, jid);
    if (verdict !== 'process') return false;
  }
  return await jeux.handleMessage(sock, msg);
}

let ok = 0, ko = 0;
const check = (n, c) => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'ÉCHEC ') + n); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // Registre propre pour ce test.
  groupOwner._reset();
  groupOwner.setRuntime({
    isAlive: (id) => [groupOwner.sessionOf(sockA), groupOwner.sessionOf(sockB)].includes(String(id)),
    listActive: () => [groupOwner.sessionOf(sockA), groupOwner.sessionOf(sockB)]
  });
  groupOwner.invalidateMeta(G);

  // 1. Une seule session revendique le groupe.
  check('A revendique le groupe', (await groupOwner.route(sockA, groupMsg(P(1), 'bonjour'), G)) === 'process');
  check('B ignore le groupe', (await groupOwner.route(sockB, groupMsg(P(1), '.quizcat'), G)) === 'ignore');

  // 2. Quiz : la session non propriétaire ne répond pas.
  check('A traite .quizcat', (await dispatch(sockA, groupMsg(P(1), '.quizcat'))) === true);
  check('B ne traite pas .quizcat', (await dispatch(sockB, groupMsg(P(1), '.quizcat'))) === false);
  check('une seule réponse quiz', sockA.group.some((l) => l.includes('Catégories du quiz')) && !sockB.group.some((l) => l.includes('Catégories du quiz')));

  // 3. Loup-Garou : les commandes de groupe passent par A seulement.
  check('A ouvre une partie', (await dispatch(sockA, groupMsg(P(1), '.lg'))) === true);
  check('B ne peut pas rejoindre', (await dispatch(sockB, groupMsg(P(2), '.lg join'))) === false);
  check('A peut inscrire un joueur', (await dispatch(sockA, groupMsg(P(2), '.lg join'))) === true);
  const game = lg._games.get(G);
  check('deux joueurs inscrits', game && game.players.length === 2);
  if (game) game.players.forEach((p) => { p.role = 'villageois'; }); // raccourci : la partie reste en salon

  // 4. Message privé : seule la session propriétaire de la partie répond.
  const beforeA = sockA.dms.length, beforeB = sockB.dms.length;
  check('A répond en privé', (await jeux.handleMessage(sockA, privateMsg(P(2), 'role'))) === true);
  check('B ignore le message privé', (await jeux.handleMessage(sockB, privateMsg(P(2), 'role'))) === false);
  check('un seul message privé envoyé', sockA.dms.length === beforeA + 1 && sockB.dms.length === beforeB);

  // 5. Mode nuit : la minuterie utilise le socket du propriétaire courant.
  await jeux.start(sockA);
  await jeux.start(sockB);
  check('A configure le mode nuit', (await dispatch(sockA, groupMsg(P(1), '.modenuit 22:00 06:00'))) === true);
  const c = nuit._cfgs()[G];
  check('configuration enregistrée', !!c && c.start === 22 * 60);
  c.enabled = true; c.applied = 'open'; c.failAt = 0;
  sockA.settings.length = 0; sockB.settings.length = 0;
  await nuit.tick(23 * 60);
  check('fermeture par la session A', sockA.settings[sockA.settings.length - 1] === 'announcement' && sockB.settings.length === 0);

  // Transfert du groupe à B : la minuterie doit changer de socket.
  groupOwner.claim(G, groupOwner.sessionOf(sockB), { force: true, reason: 'test' });
  c.applied = 'open'; c.failAt = 0;
  sockA.settings.length = 0; sockB.settings.length = 0;
  await nuit.tick(23 * 60);
  check('fermeture par la session B après transfert', sockB.settings[sockB.settings.length - 1] === 'announcement' && sockA.settings.length === 0);

  // 6. Nettoyage.
  await dispatch(sockB, groupMsg(P(1), '.lg stop'));
  await wait(300);
  const data = store.get('modenuit', {});
  delete data[G];
  store.save('modenuit');
  groupOwner.release(G, 'fin de test');
  const file = path.join(ROOT, 'storage', 'database', 'group-ownership-jeux-test.json');
  try { fs.unlinkSync(file); } catch (_) { /* déjà absent */ }

  console.log('\n' + ok + ' OK / ' + ko + ' échec(s)');
  process.exit(ko ? 1 : 0);
})().catch((e) => {
  console.error('CRASH TEST', e);
  process.exit(2);
});
