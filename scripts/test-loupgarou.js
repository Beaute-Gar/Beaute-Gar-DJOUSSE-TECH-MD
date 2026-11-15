'use strict';
// Simulation hors ligne du Loup-Garou : node scripts/test-loupgarou.js
process.env.LG_LOBBY_MS = '60000';
process.env.LG_STEP_MS = '1500';
process.env.LG_DAY_MS = '150';
process.env.LG_VOTE_MS = '700';
process.env.LG_HUNTER_MS = '1500';
process.env.LG_MIN = '5';

const lg = require('../src/jeux/loupgarou');
const G = '1203@g.us';
const BOT = '237699999999@s.whatsapp.net';
const jidOf = (i) => '2376000000' + String(i).padStart(2, '0') + '@s.whatsapp.net';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (t) => String(t || '').replace(/[╭╰┄『』❍│✦⪼]/g, ' ').replace(/\s+/g, ' ').trim();
let ok = 0, ko = 0;
const check = (n, c) => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'ÉCHEC ') + n); };

function makeSock(n, opts) {
  const o = opts || {};
  const s = {
    group: [], dms: [], settings: [],
    user: { id: '237699999999:3@s.whatsapp.net' },
    groupMetadata: async () => ({
      announce: false,
      participants: [{ id: BOT, admin: 'admin' }].concat(Array.from({ length: n }, (_, i) => ({ id: jidOf(i + 1), admin: i === 0 ? 'superadmin' : null })))
    }),
    groupSettingUpdate: async (g, v) => { s.settings.push(v); if (o.settingFails) throw new Error('not admin'); },
    sendMessage: async (jid, m) => {
      if (jid.endsWith('@g.us')) s.group.push(clean(m.text));
      else {
        if (o.failDm && jid === jidOf(o.failDm)) throw new Error('DM refusé');
        s.dms.push({ to: jid, text: clean(m.text) });
      }
    }
  };
  return s;
}
const grp = (sock, from, text) => lg.handleMessage(sock, { key: { remoteJid: G, participant: from, fromMe: false }, pushName: 'J' + from.slice(-2), message: { conversation: text } });
const prv = (sock, from, text) => lg.handleMessage(sock, { key: { remoteJid: from, fromMe: false }, pushName: 'J', message: { conversation: text } });

async function lobby(sock, n) {
  await grp(sock, jidOf(1), '.lg');
  for (let i = 2; i <= n; i++) await grp(sock, jidOf(i), '.lg join');
  await grp(sock, jidOf(2), '.lg join'); // doublon ignoré
}

// Joue les réponses automatiques de tous les rôles jusqu'à la fin de la partie
async function drive(sock, limitMs, hooks) {
  const h = hooks || {};
  const t0 = Date.now();
  let invalidSent = false;
  while (lg._games.has(G) && Date.now() - t0 < limitMs) {
    const g = lg._games.get(G);
    for (const [p, e] of [...g.pending.entries()]) {
      if (e.done || e.answered) continue;
      e.answered = true;
      let ans;
      const opt = e.options;
      const r = () => opt[Math.floor(Math.random() * opt.length)];
      if (e.kind === 'cupid') ans = r() + ' ' + opt.filter((x) => x !== 0).slice(-1)[0];
      else if (e.kind === 'witch_heal') ans = Math.random() < 0.5 ? '1' : '0';
      else if (e.kind === 'witch_kill') ans = Math.random() < 0.4 ? String(r()) : '0';
      else ans = String(r());
      if (!invalidSent) { invalidSent = true; e.answered = false; await prv(sock, p.dm, 'blabla'); e.answered = true; }
      await prv(sock, p.dm, ans);
    }
    if (g.phase === 'VOTE') {
      for (const p of g.players) {
        if (p.alive && !g.votes.has(p)) {
          const al = g.players.filter((x) => x.alive);
          await grp(sock, p.jid, '.vote ' + (Math.random() < 0.1 ? 0 : al[Math.floor(Math.random() * al.length)].num));
        }
      }
    }
    if (h.onTick) await h.onTick(g);
    await wait(15);
  }
}

(async () => {
  // 1. Parties complètes avec des effectifs variés
  let finished = 0, restored = 0;
  const sizes = [5, 6, 7, 8, 9, 10, 12, 14];
  for (let k = 0; k < 24; k++) {
    const n = sizes[k % sizes.length];
    const sock = makeSock(n);
    await lobby(sock, n);
    await grp(sock, jidOf(1), '.lg go');
    await drive(sock, 20000);
    const over = !lg._games.has(G);
    const last = sock.group[sock.group.length - 1] || '';
    if (over && /VICTOIRE|Tout le monde est mort/.test(sock.group.join('\n'))) finished++;
    if (sock.settings.length === 0 || sock.settings[sock.settings.length - 1] === 'not_announcement') restored++;
    if (!over) { console.log('partie bloquée, n =', n, lg._games.get(G).phase); lg._games.get(G).stopped = true; await wait(500); }
  }
  check('24 parties jouées jusqu\'au bout sans blocage', finished === 24);
  check('groupe rouvert à la fin de chaque partie', restored === 24);

  // 2. Cas particuliers
  let sock = makeSock(6);
  await grp(sock, jidOf(1), '.lg'); await grp(sock, jidOf(2), '.lg join');
  await grp(sock, jidOf(1), '.lg go');
  check('annulée si trop peu de joueurs', sock.group.some((l) => l.includes('au moins 5 joueurs')) && !lg._games.has(G));

  sock = makeSock(6, { failDm: 4 });
  await lobby(sock, 6); await grp(sock, jidOf(1), '.lg go');
  check('annulée si un message privé échoue', sock.group.some((l) => l.includes('impossible d\'envoyer le rôle')) && !lg._games.has(G));

  sock = makeSock(7);
  await lobby(sock, 7); await grp(sock, jidOf(3), '.lg go');
  check('un simple membre ne peut pas lancer', sock.group.some((l) => l.includes('Seul celui qui a ouvert')) && lg._games.has(G));
  await grp(sock, jidOf(1), '.lg go');
  await wait(200);
  await prv(sock, jidOf(5), 'role');
  check('commande « role » en privé', sock.dms.filter((d) => d.to === jidOf(5)).length >= 2);
  const g = lg._games.get(G);
  await grp(sock, jidOf(1), '.lg stop'); // arrêt par l'hôte
  for (let i = 0; i < 100 && lg._games.has(G); i++) await wait(30);
  check('arrêt manuel proprement terminé', !lg._games.has(G) && sock.group.some((l) => l.includes('Partie arrêtée')));
  check('groupe rouvert après arrêt', sock.settings[sock.settings.length - 1] === 'not_announcement');

  sock = makeSock(6, { settingFails: true });
  await lobby(sock, 6); await grp(sock, jidOf(1), '.lg go');
  await drive(sock, 20000);
  check('partie OK même si la fermeture du groupe échoue', !lg._games.has(G) && /VICTOIRE|Tout le monde/.test(sock.group.join('\n')));

  // 3. Journal d'une partie
  sock = makeSock(8);
  await lobby(sock, 8); await grp(sock, jidOf(1), '.lg go');
  await drive(sock, 20000);
  console.log('\n--- Extrait du groupe ---\n' + sock.group.slice(0, 9).join('\n---\n'));
  console.log('\n--- Extrait des messages privés ---\n' + sock.dms.slice(0, 5).map((d) => d.text.slice(0, 90).replace(/\n/g, ' ')).join('\n'));
  console.log('\n' + ok + ' OK / ' + ko + ' échec(s)');
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.error('CRASH TEST', e); process.exit(2); });
