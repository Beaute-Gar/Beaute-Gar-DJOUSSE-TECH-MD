'use strict';

/**
 * Smoke test de la commande .promo (reseau requis).
 * Verifie : .promo, .promo live, .promo books et un filtre dynamique.
 */

const promo = require('../src/commandes/08-recherche/promo');

const sent = [];
const sock = {
  async sendMessage(from, content) {
    sent.push(content.text || '');
  }
};
async function run(args) {
  sent.length = 0;
  await promo.execute(sock, { key: {} }, 'x@s.whatsapp.net', args);
  return sent.pop() || '';
}

(async () => {
  console.log('===== .promo =====');
  const main = await run([]);
  console.log(main.split('\n').slice(0, 20).join('\n'));
  if (!/Aucun match/.test(main) && !/match\(s\)/.test(main)) throw new Error('Sortie .promo invalide');

  console.log('\n===== .promo live =====');
  const live = await run(['live']);
  console.log(live.split('\n').slice(0, 12).join('\n'));

  console.log('\n===== .promo books =====');
  const books = await run(['books']);
  console.log(books.split('\n').slice(0, 22).join('\n'));

  const team = (main.match(/│ \d{2}:\d{2}  (.+?) vs /) || [])[1];
  if (team) {
    const word = team.split(/\s+/).find(w => w.length >= 4) || team;
    console.log('\n===== .promo ' + word + ' =====');
    const filtered = await run([word]);
    console.log(filtered.split('\n').slice(0, 14).join('\n'));
    if (!filtered.includes(team)) throw new Error('Filtre invalide pour ' + word);
  }

  console.log('\n===== .promo compare =====');
  const cmp = await run(['compare', 'Belgium', '2.50', '3.40', '2.80']);
  console.log(cmp.split('\n').slice(0, 14).join('\n'));
  if (!/Réf\./.test(cmp) && !/Pas de cotes/.test(cmp)) throw new Error('Compare invalide');

  console.log('\nOK : .promo fonctionne.');
  process.exit(0);
})().catch((e) => {
  console.log('ECHEC:', e.message);
  process.exit(1);
});
