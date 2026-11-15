'use strict';
// Simulation hors ligne du jeu avec un faux socket WhatsApp : node scripts/test-actionverite.js
process.env.AV_AI = 'off';
process.env.AV_JUDGE = 'local';
process.env.AV_REGISTER_MS = '400';
process.env.AV_CHOICE_MS = '700';
process.env.AV_ANSWER_MS = '700';

const av = require('../src/jeux/actionverite');
const G = '1203@g.us';
const U = { owner: '237600000001@s.whatsapp.net', b: '237600000002@s.whatsapp.net', c: '237600000003@s.whatsapp.net', d: '237600000004@s.whatsapp.net' };
const BOT = '237699999999@s.whatsapp.net';
const log = [];
const sock = {
  user: { id: '237699999999:12@s.whatsapp.net' },
  groupMetadata: async () => ({
    announce: false,
    participants: [
      { id: BOT, admin: 'admin' }, { id: U.owner, admin: 'superadmin' },
      { id: U.b, admin: null }, { id: U.c, admin: null }, { id: U.d, admin: null }
    ]
  }),
  groupParticipantsUpdate: async (g, l, a) => { log.push('MAJ ' + a + ' ' + l.map((x) => x.slice(0, 12)).join(',')); },
  groupSettingUpdate: async (g, s) => { log.push('RÉGLAGE ' + s); },
  sendMessage: async (g, m) => {
    const clean = String(m.text || '')
      .replace(/[╭╰┄『』❍│✦⪼]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    log.push('BOT> ' + clean);
  }
};
const say = (from, text) => av.handleMessage(sock, { key: { remoteJid: G, participant: from, fromMe: false }, message: { conversation: text } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, ko = 0;
const check = (n, c) => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'ÉCHEC ') + n); };

(async () => {
  check('non-admin refusé', (await say(U.b, '.start game'), log.some((l) => l.includes('Seuls les admins'))));
  await say(U.owner, '.start game');
  await say(U.b, '.jouer'); await say(U.c, '.jouer'); await say(U.d, '.jouer'); await say(U.b, '.jouer');
  await wait(600);
  check('promotion des non-admins', log.some((l) => l.startsWith('MAJ promote')));
  check('groupe muet', log.includes('RÉGLAGE announcement'));

  let sanctioned = false, turns = 0;
  const g = av._games.get(G);
  for (let i = 0; i < 400 && av._games.has(G); i++) {
    const t = g.turn;
    if (t && t.phase === 'choice' && !t.sent) {
      t.sent = true; turns++;
      const other = g.players.find((p) => p !== t.player);
      if (!sanctioned) { sanctioned = true; await say('x' + other.jid, 'verite').catch(() => {}); await say(other.jid, 'verite'); }
      await say(t.player.jid, turns % 2 ? 'veriter' : 'Action ');
    } else if (t && t.phase === 'answer' && !t.sent2) {
      t.sent2 = true;
      if (turns === 3) { /* pas de réponse : timeout */ } else await say(t.player.jid, 'Ma réponse complète à ce défi');
    }
    await wait(30);
  }
  await wait(300);
  check('sanction hors tour annoncée', log.some((l) => l.includes('hors tour')));
  check('tour sauté appliqué', log.some((l) => l.includes('est sauté')));
  check('timeout géré', log.some((l) => l.includes('pas répondu à temps')));
  check('3 manches jouées', log.filter((l) => l.includes('Manche')).length === 3);
  check('classement final', log.some((l) => l.includes('Classement final') && l.includes('👑')));
  check('droits restaurés (demote)', log.some((l) => l.startsWith('MAJ demote')));
  check('réglage restauré', log.includes('RÉGLAGE not_announcement'));
  check('admin d\'origine non rétrogradé', !log.some((l) => l.startsWith('MAJ demote') && l.includes('237600000001')));
  check('partie nettoyée', !av._games.has(G));
  console.log('\n' + log.join('\n'));
  console.log('\n' + ok + ' OK / ' + ko + ' échec(s)');
  process.exit(ko ? 1 : 0);
})();
