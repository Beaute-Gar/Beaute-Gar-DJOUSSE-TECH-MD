'use strict';

// Fournit les questions : IA (illimitée) puis banque locale de secours. Ne lève jamais d'exception.
const cfg = require('./config');
const ai = require('../commun/ai');
const { normalize } = require('../commun/text');
const { BANK, CATEGORIES } = require('./bank');

const usedLocal = new Map(); // chatId -> Set d'indices déjà posés
const recentAi = new Map(); // chatId -> dernières questions IA

const pick = (a) => a[Math.floor(Math.random() * a.length)];

function resolveCategory(arg) {
  const a = normalize(arg);
  if (!a || ['tout', 'toutes', 'all', 'mix', 'random'].includes(a)) return null;
  for (const [key, label] of Object.entries(CATEGORIES)) {
    if (a === key || a === normalize(label) || normalize(label).split(' ').includes(a) || key.startsWith(a)) return key;
  }
  if (a === 'foot' || a === 'football') return 'sport';
  if (a === 'manga' || a === 'otaku') return 'anime';
  if (a === 'info' || a === 'code' || a === 'informatique') return 'tech';
  if (a === 'afrique') return 'cameroun';
  if (a === 'cinema' || a === 'musique') return 'musique_cinema';
  if (a === 'animaux') return 'nature';
  return undefined; // catégorie inconnue
}

function fromLocal(chatId, cat) {
  if (!usedLocal.has(chatId)) usedLocal.set(chatId, new Set());
  const used = usedLocal.get(chatId);
  const idx = BANK.map((_, i) => i).filter((i) => (!cat || BANK[i].cat === cat));
  let free = idx.filter((i) => !used.has(i));
  if (!free.length) {
    idx.forEach((i) => used.delete(i)); // tout est passé : on recommence
    free = idx;
  }
  const i = pick(free);
  used.add(i);
  const b = BANK[i];
  return { q: b.q, a: b.a, alt: b.alt, cat: b.cat, source: 'local' };
}

function buildPrompt(label, avoid) {
  return [
    'Tu es un animateur de quiz francophone.',
    'Génère UNE question de culture générale en français, catégorie : ' + label + ', difficulté facile à moyenne.',
    'La question doit être factuelle, certaine, vérifiable, et avoir une réponse courte et unique (un nom, un mot ou un nombre).',
    'Si tu as le moindre doute sur la réponse, choisis une autre question.',
    avoid.length ? 'Ne répète pas ces questions :\n- ' + avoid.join('\n- ') : '',
    'Réponds UNIQUEMENT par un objet JSON sur une seule ligne, sans texte autour, de la forme :',
    '{"q":"la question","a":"la réponse","alt":["autre façon d\'écrire la réponse"]}'
  ].filter(Boolean).join('\n');
}

async function fromAi(chatId, cat) {
  const label = cat ? CATEGORIES[cat] : pick(Object.values(CATEGORIES));
  const list = recentAi.get(chatId) || [];
  const raw = await ai.ask(buildPrompt(label, list.slice(-6).map((s) => s.slice(0, 70))), { maxTokens: 250 });
  const m = String(raw || '').match(/\{[\s\S]*?\}/);
  if (!m) throw new Error('pas de JSON');
  const o = JSON.parse(m[0]);
  const q = typeof o.q === 'string' ? o.q.trim() : '';
  const a = typeof o.a === 'string' ? o.a.trim() : (typeof o.a === 'number' ? String(o.a) : '');
  const alt = Array.isArray(o.alt) ? o.alt.filter((x) => typeof x === 'string' && x.length < 60).slice(0, 6) : [];
  if (q.length < 12 || q.length > 220 || !a || a.length > 60) throw new Error('question invalide');
  if (normalize(q).includes(normalize(a)) && a.length > 3) throw new Error('réponse dans la question');
  if (list.some((x) => normalize(x) === normalize(q))) throw new Error('doublon');
  list.push(q);
  recentAi.set(chatId, list.slice(-30));
  return { q, a, alt, cat: cat || 'mix', source: 'ia' };
}

async function next(chatId, cat) {
  try {
    if (cfg.SOURCE !== 'local' && ai.enabled()) {
      try {
        return await fromAi(chatId, cat);
      } catch (e) {
        console.error('[quiz] IA indisponible, banque locale :', e.message);
      }
    }
  } catch (_) { /* jamais d'exception */ }
  return fromLocal(chatId, cat);
}

module.exports = { next, resolveCategory, CATEGORIES };
