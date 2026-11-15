'use strict';
// Simulation hors ligne du mode nuit : node scripts/test-modenuit.js
const nuit = require('../src/groupe/modenuit');
const store = require('../src/jeux/commun/store');
const G = '1203@g.us', ADMIN = '237600000001@s.whatsapp.net', MEMBER = '237600000002@s.whatsapp.net';
const log = [], settings = [];
let botIsAdmin = true;
const sock = {
  user: { id: '237699999999:1@s.whatsapp.net' },
  groupMetadata: async () => ({ participants: [{ id: '237699999999@s.whatsapp.net', admin: botIsAdmin ? 'admin' : null }, { id: ADMIN, admin: 'admin' }, { id: MEMBER }] }),
  groupSettingUpdate: async (g, v) => { if (!botIsAdmin) throw new Error('forbidden'); settings.push(v); },
  sendMessage: async (j, m) => { log.push(m.text.replace(/\n+/g, ' | ')); }
};
const say = (from, t) => nuit.handleMessage(sock, { key: { remoteJid: G, participant: from, fromMe: false }, message: { conversation: t } });
let ok = 0, ko = 0;
const check = (n, c) => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'ÉCHEC ') + n); };
const H = (h, m) => h * 60 + (m || 0);

(async () => {
  const data = store.get('modenuit', {}); for (const k of Object.keys(data)) delete data[k];

  check('parseHM', nuit.parseHM('22:00') === H(22) && nuit.parseHM('6h') === H(6) && nuit.parseHM('23h30') === H(23, 30) && nuit.parseHM('25:00') === null && nuit.parseHM('abc') === null);
  check('fenêtre qui passe minuit', nuit.inWindow(H(23), H(22), H(6)) && nuit.inWindow(H(3), H(22), H(6)) && !nuit.inWindow(H(12), H(22), H(6)));
  check('fenêtre dans la même journée', nuit.inWindow(H(14), H(13), H(15)) && !nuit.inWindow(H(16), H(13), H(15)));

  await say(MEMBER, '.modenuit 22:00 06:00');
  check('membre refusé', log.some((l) => l.includes('Seuls les admins')));
  await say(ADMIN, '.modenuit 22:00 22:00');
  check('heures identiques refusées', log.some((l) => l.includes('Utilisation')));
  await say(ADMIN, '.modenuit 22:00 06:00 Mars/Olympus');
  check('fuseau inconnu refusé', log.some((l) => l.includes('Fuseau horaire inconnu')));

  await say(ADMIN, '.modenuit 22:00 06:00 Africa/Douala');
  check('configuration enregistrée', !!nuit._cfgs()[G] && nuit._cfgs()[G].start === H(22));
  await say(ADMIN, '.modenuit');
  check('statut affiché', log.some((l) => l.includes('Fermeture')));

  const c = nuit._cfgs()[G];
  c.applied = 'open'; settings.length = 0;
  await nuit.tick(H(23));
  check('fermeture la nuit', settings[settings.length - 1] === 'announcement' && log.some((l) => l.includes('Mode nuit activé')));
  const n = settings.length;
  await nuit.tick(H(23, 30));
  check('pas de répétition', settings.length === n);
  await nuit.tick(H(7));
  check('réouverture le matin', settings[settings.length - 1] === 'not_announcement' && log.some((l) => l.includes('Bonjour')));

  // un jeu en cours empêche la modification
  const busy = require('../src/jeux/commun/busy');
  busy.mark(G); const m = settings.length;
  await nuit.tick(H(23));
  check('ignoré pendant un jeu (ex. loup-garou)', settings.length === m);
  busy.unmark(G);

  // bot non admin : pas de crash, pas de spam
  botIsAdmin = false; c.applied = 'open'; c.failAt = 0;
  await nuit.tick(H(23));
  const failAt = c.failAt;
  await nuit.tick(H(23));
  check('bot non admin : erreur gérée sans crash', failAt > 0 && c.failAt === failAt);
  botIsAdmin = true;

  await say(ADMIN, '.modenuit off');
  check('désactivation', nuit._cfgs()[G].enabled === false);
  const k = settings.length; await nuit.tick(H(23));
  check('rien ne se passe quand c\'est désactivé', settings.length === k);
  console.log('\n' + ok + ' OK / ' + ko + ' échec(s)');
  const d = store.get('modenuit', {}); for (const key of Object.keys(d)) delete d[key]; store.save('modenuit');
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.error('CRASH TEST', e); process.exit(2); });
