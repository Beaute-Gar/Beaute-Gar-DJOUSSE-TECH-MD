'use strict';
// Vérifie que le dispatcheur charge tous les modules et route les commandes : node scripts/test-dispatch.js
process.env.AV_AI = 'off';
const jeux = require('../src/jeux');
const G = '1@g.us', A = '237600000001@s.whatsapp.net';
const out = [];
const sock = {
  user: { id: '237699999999:1@s.whatsapp.net' },
  groupMetadata: async () => ({ participants: [{ id: '237699999999@s.whatsapp.net', admin: 'admin' }, { id: A, admin: 'admin' }] }),
  groupSettingUpdate: async () => {},
  sendMessage: async (j, m) => { out.push(m.text); }
};
const say = (t) => jeux.handleMessage(sock, { key: { remoteJid: G, participant: A, fromMe: false }, message: { conversation: t } });
(async () => {
  const r = [await say('.quizcat'), await say('.lg roles'), await say('.modenuit'), await say('bonjour tout le monde'), await say('.autrecommande')];
  const ok = r[0] === true && r[1] === true && r[2] === true && r[3] === false && r[4] === false;
  await jeux.start(sock);
  console.log(ok ? 'OK  dispatcheur : commandes routées, messages normaux ignorés' : 'ÉCHEC ' + JSON.stringify(r));
  process.exit(ok ? 0 : 1);
})();
