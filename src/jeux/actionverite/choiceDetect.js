'use strict';

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lev(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return d[m][n];
}

const WORDS = {
  truth: ['verite', 'verites', 'veriter', 'veritee', 'verit', 'virite', 'verti', 'truth'],
  dare: ['action', 'actions', 'axion', 'acsion', 'actoin', 'dare', 'defi']
};
// Raccourcis acceptés seulement si le message ne contient que ça
const SHORT = { truth: ['v', '1'], dare: ['a', '2'] };

function matchToken(tok, allowShort) {
  for (const kind of ['truth', 'dare']) {
    if (allowShort && SHORT[kind].includes(tok)) return kind;
    for (const w of WORDS[kind]) {
      if (tok === w) return kind;
      if (tok.length >= 4 && lev(tok, w) <= 1) return kind;
    }
  }
  return null;
}

/**
 * Retourne 'truth', 'dare' ou null.
 * Ne regarde que les messages courts (4 mots max) pour ne pas
 * confondre avec une phrase de conversation.
 */
function detectChoice(text) {
  const t = normalize(text);
  if (!t) return null;
  const tokens = t.split(' ');
  if (tokens.length > 4) return null;
  const allowShort = tokens.length === 1;

  const found = new Set();
  for (const tok of tokens) {
    const k = matchToken(tok, allowShort);
    if (k) found.add(k);
  }
  if (found.size !== 1) return null; // aucun choix, ou les deux : ambigu
  return [...found][0];
}

module.exports = { detectChoice, normalize };
