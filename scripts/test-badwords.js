'use strict';

/**
 * Test de la liste de mots interdits (src/lib/badwords.js)
 * et de son branchement dans le moteur antibadword.
 *
 * node scripts/test-badwords.js
 */

const path = require('path');
const ROOT = path.join(__dirname, '..');

// Expulsion immédiate pour les menaces pendant le test.
process.env.BADWORDS_KICK = 'menaces';
process.env.BADWORDS_LIGHT = 'true';

const bw = require(path.join(ROOT, 'src/lib/badwords'));
const db = require(path.join(ROOT, 'src/lib/database'));
const { handleProtection } = require(path.join(ROOT, 'src/handlers/protection-handler'));

let ok = 0, ko = 0;
const check = (name, cond) => { cond ? ok++ : ko++; console.log((cond ? 'OK  ' : 'ECHEC ') + name); };

/* ---------- 1. Detection pure ---------- */
check('phrase normale ignorée', bw.check('bonjour tout le monde') === null);
check('majuscules + lettres répétées', bw.check('PUUUUTE')?.category === 'sexuel');
check('contournement leet', bw.check('c0nnard')?.category === 'grossier');
check('lettres espacées', bw.check('p u t e')?.category === 'sexuel');
check('lettres séparées par des points', bw.check('p.u.t.e')?.category === 'sexuel');
check('leet pu73', bw.check('pu73')?.category === 'sexuel');
check('mots entiers : salopette', bw.check('salopette') === null);
check('mots entiers : contact', bw.check('contact') === null);
check('mots entiers : assiette', bw.check('assiette') === null);
check('mots entiers : tgv', bw.check('tgv') === null);
check('numéro de téléphone ignoré', bw.check('237 6 00 00 00 03') === null);
check('phrase haineuse', bw.check('mort aux juifs')?.category === 'haine');
check('menace de mort', bw.check('je vais te tuer')?.category === 'menaces');
check('sigle ntm', bw.check('ntm')?.category === 'sigles');
check('anglais', bw.check('fuck you')?.category === 'anglais');
check('insulte légère', bw.check('abruti')?.category === 'insultes_legeres');
check('insulte légère désactivable', bw.check('abruti', { skip: ['insultes_legeres'] }) === null);

/* ---------- 2. Integration antibadword ---------- */
const G = '120363666666666666@g.us';
const BOT = '237600000001@s.whatsapp.net';
const MEMBER = '237600000004@s.whatsapp.net';

const meta = {
  subject: 'Groupe Test',
  participants: [
    { id: BOT, admin: 'admin' },
    { id: MEMBER, admin: null }
  ]
};

function makeSock() {
  const sent = [];
  const kicked = [];
  return {
    sent,
    kicked,
    user: { id: BOT },
    groupMetadata: async () => meta,
    profilePictureUrl: async () => null,
    groupParticipantsUpdate: async (_g, jids) => { kicked.push(...jids); },
    sendMessage: async (_jid, content) => { sent.push(content); }
  };
}

const msg = (text, id = 'm' + Math.random()) => ({
  key: { remoteJid: G, participant: MEMBER, fromMe: false, id },
  message: { conversation: text }
});

function setupProtection(extra = {}) {
  db.setSetting(`protection_${G}`, { antibadword: true, ...extra });
  db.setSetting(`blacklist_${G}`, []);
  db.setSetting(`warns_${G}`, {});
}

function cleanup() {
  const s = db.get('settings');
  for (const k of Object.keys(s)) {
    if (k.endsWith('_' + G)) delete s[k];
  }
  db.set('settings', s);
}

(async () => {
  // A. Mot grossier : suppression + avertissement.
  setupProtection();
  let sock = makeSock();
  let handled = await handleProtection(sock, msg('espèce de connard'));
  check('grossier détecté et traité', handled === true);
  check('message supprimé', sock.sent.some((c) => c.delete));
  check('avertissement envoyé', sock.sent.some((c) => /Mot interdit/.test(c.text || '') && /Avertissement/.test(c.text || '')));
  check('catégorie affichée', sock.sent.some((c) => /grossièreté/.test(c.text || '')));

  // B. Menace : expulsion immédiate (BADWORDS_KICK=menaces).
  sock = makeSock();
  handled = await handleProtection(sock, msg('je vais te tuer'));
  check('menace traitée', handled === true);
  check('menace : expulsion', sock.kicked.includes(MEMBER));
  check('menace : message d’expulsion', sock.sent.some((c) => /expulsé/.test(c.text || '')));

  // C. Phrase innocente : rien.
  sock = makeSock();
  handled = await handleProtection(sock, msg('on mange une salopette ? non, une assiette'));
  check('phrase innocente non traitée', handled === false);
  check('aucune expulsion', sock.kicked.length === 0);

  // D. Liste personnalisée du groupe.
  setupProtection();
  db.setSetting(`badwords_${G}`, ['zebi']);
  sock = makeSock();
  handled = await handleProtection(sock, msg('espèce de zebi'));
  check('liste personnalisée détectée', handled === true);

  // E. Insultes légères désactivées pour le groupe.
  setupProtection();
  db.setSetting(`badwords_${G}`, []);
  db.setSetting(`badwords_light_${G}`, false);
  sock = makeSock();
  handled = await handleProtection(sock, msg('espèce d’abruti'));
  check('insulte légère ignorée quand désactivée', handled === false);

  // F. Insultes légères activées par défaut.
  db.setSetting(`badwords_light_${G}`, true);
  sock = makeSock();
  handled = await handleProtection(sock, msg('espèce d’abruti'));
  check('insulte légère détectée quand activée', handled === true);

  cleanup();

  console.log('\n' + ok + ' OK / ' + ko + ' echec(s)');
  process.exit(ko ? 1 : 0);
})().catch((e) => {
  console.error(e);
  cleanup();
  process.exit(1);
});
