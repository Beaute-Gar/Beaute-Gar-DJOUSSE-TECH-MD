'use strict';
// Simulation hors ligne du quiz : node scripts/test-quiz.js
process.env.QUIZ_SOURCE = 'local';
process.env.AV_AI = 'off';
process.env.QUIZ_TIME_MS = '600';
process.env.QUIZ_PAUSE_MS = '100';

const quiz = require('../src/jeux/quiz');
const G = '1203@g.us';
const A = '237600000001@s.whatsapp.net', B = '237600000002@s.whatsapp.net', C = '237600000003@s.whatsapp.net';
const log = [];
const sock = {
  user: { id: '237699999999:1@s.whatsapp.net' },
  groupMetadata: async () => ({ participants: [{ id: A, admin: 'admin' }, { id: B }, { id: C }] }),
  sendMessage: async (j, m) => { log.push(m.text.replace(/\n+/g, ' | ')); }
};
const say = (from, text) => quiz.handleMessage(sock, { key: { remoteJid: G, participant: from, fromMe: false }, pushName: 'P' + from.slice(-1), message: { conversation: text } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, ko = 0;
const check = (n, c) => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'ÉCHEC ') + n); };

(async () => {
  await say(A, '.quizcat');
  check('liste des catégories', log.some((l) => l.includes('Catégories du quiz')));
  await say(A, '.quiz 3 xyz');
  check('catégorie inconnue refusée', log.some((l) => l.includes('Catégorie inconnue')));

  await say(A, '.quiz 4 cameroun');
  await say(B, '.quiz 4');
  check('double lancement refusé', log.some((l) => l.includes('déjà en cours')));

  const g = quiz._games.get(G);
  let round = 0, wrong = 0;
  for (let i = 0; i < 600 && quiz._games.has(G); i++) {
    const cur = g.current;
    if (cur && !cur.locked && !cur.done) {
      cur.done = true; round++;
      if (round === 3) { /* personne ne répond : temps écoulé */ }
      else {
        await say(C, 'une mauvaise réponse'); wrong++;
        const who = round % 2 ? B : C;
        await say(who, round === 1 ? 'Je pense que c\'est ' + cur.q.a.toUpperCase() : cur.q.a);
        await say(A, cur.q.a); // arrive après : ne doit pas compter
      }
    }
    await wait(20);
  }
  await wait(200);
  check('bonnes réponses détectées', log.filter((l) => l.includes('Bravo')).length === 3);
  check('temps écoulé géré', log.some((l) => l.includes('Temps écoulé')));
  check('un seul gagnant par question', log.filter((l) => l.includes('Bravo')).length <= 4);
  check('indice envoyé', log.some((l) => l.includes('Indice')));
  check('classement final', log.some((l) => l.includes('Fin du quiz') && l.includes('🥇')));
  check('partie nettoyée', !quiz._games.has(G));

  await say(B, '.quizscore');
  check('classement général enregistré', log.some((l) => l.includes('Classement général')));

  // arrêt en cours de partie
  await say(A, '.quiz 5'); await wait(200);
  await say(C, '.quizstop');
  check('arrêt refusé à un simple membre', log.some((l) => l.includes('Seul celui qui a lancé')));
  await say(A, '.quizstop'); await wait(300);
  check('arrêt par le lanceur', !quiz._games.has(G));

  console.log('\n' + log.slice(0, 14).join('\n') + '\n...');
  console.log('\n' + ok + ' OK / ' + ko + ' échec(s)');
  process.exit(ko ? 1 : 0);
})();
