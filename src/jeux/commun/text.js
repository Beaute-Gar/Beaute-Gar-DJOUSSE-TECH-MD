'use strict';

const style = require('../../config/style');

function unwrap(m) {
  let cur = m;
  for (let i = 0; i < 4 && cur; i++) {
    const inner =
      (cur.ephemeralMessage && cur.ephemeralMessage.message) ||
      (cur.viewOnceMessage && cur.viewOnceMessage.message) ||
      (cur.viewOnceMessageV2 && cur.viewOnceMessageV2.message) ||
      (cur.documentWithCaptionMessage && cur.documentWithCaptionMessage.message);
    if (!inner) break;
    cur = inner;
  }
  return cur;
}

function extractText(msg) {
  const m = unwrap(msg && msg.message) || {};
  return String(
    m.conversation ||
      (m.extendedTextMessage && m.extendedTextMessage.text) ||
      (m.imageMessage && m.imageMessage.caption) ||
      (m.videoMessage && m.videoMessage.caption) ||
      ''
  ).trim();
}

// minuscules, sans accents, ponctuation -> espaces ; "3,14" -> "3.14"
function normalize(s) {
  let t = String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae');
  t = t.replace(/(\d),(\d)/g, '$1.$2');
  t = t.replace(/[^a-z0-9\s.]/g, ' ');
  t = t.replace(/(?<!\d)\.|\.(?!\d)/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Tous les messages sortants des jeux passent par le style unique du bot.
 * Un texte déjà encadré n'est jamais ré-encadré.
 */
function decorate(text) {
  if (typeof text !== 'string' || !text.trim()) return text;
  const body = text.trim();
  try {
    // Quelques préfixes explicites que renderOutgoingText ne classe pas encore.
    if (/^(?:🔒|😕|☠️|🛑)/u.test(body)) return style.renderError(body.split(/\r?\n/));
    if (/^🎉/u.test(body)) return style.renderSuccess(body.split(/\r?\n/));
    return style.renderOutgoingText(text);
  } catch (_) {
    return text;
  }
}

module.exports = { unwrap, extractText, normalize, lev, sleep, shuffle, decorate };
