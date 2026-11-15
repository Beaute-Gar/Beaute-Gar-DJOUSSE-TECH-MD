'use strict';

const { normalize, lev } = require('../commun/text');

const ARTICLES = new Set(['le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'au', 'aux']);

function core(s) {
  const t = normalize(s).split(' ').filter(Boolean);
  while (t.length > 1 && ARTICLES.has(t[0])) t.shift();
  return t.join(' ');
}

const isNumber = (s) => /^\d+(\.\d+)?$/.test(s);

/**
 * Une réponse est juste si elle est identique (sans accents, majuscules, articles), ou très proche
 * (1 à 2 fautes de frappe pour les réponses longues), ou si une phrase courte contient la bonne réponse.
 */
function isCorrect(input, q) {
  const c = core(input);
  if (!c) return false;
  const accepted = [q.a].concat(q.alt || []).map(core).filter(Boolean);

  for (const a of accepted) if (c === a) return true;

  const words = c.split(' ');
  for (const a of accepted) {
    if (isNumber(a)) {
      // nombres : exact seulement, mais on accepte « c'est 1789 »
      if (words.length <= 6 && words.includes(a)) return true;
      continue;
    }
    if (a.length >= 6 && lev(c, a) <= (a.length >= 10 ? 2 : 1)) return true;
    if (a.length >= 3 && words.length <= 8 && (' ' + c + ' ').includes(' ' + a + ' ')) return true;
  }
  return false;
}

// Indice : première et dernière lettre, le reste masqué
function hint(answer) {
  return String(answer)
    .split(' ')
    .map((w) => (w.length <= 2 ? w.replace(/./g, '•') : w[0] + '•'.repeat(w.length - 2) + w[w.length - 1]))
    .join(' ');
}

module.exports = { isCorrect, hint, core };
