'use strict';

// Générateur IA de défis / vérités.
// La passerelle multi-fournisseurs vit dans src/lib/ai-text.js
// (Anthropic -> Gemini -> Groq -> OpenRouter -> Pollinations).

const ai = require('../../lib/ai-text');

const recent = new Map();

const LV = {
  soft: 'flirt léger, charme, romantique, rien de gênant',
  hot: 'sensuel et coquin, sous-entendus directs',
  extreme: 'très osé et audacieux, vocabulaire adulte direct, mais jamais explicite ni pornographique'
};

const KIND = {
  dare: 'UN défi (action à réaliser dans une conversation WhatsApp : vocal, message, confession, mime, etc.)',
  truth: 'UNE question de vérité (question intime à laquelle on doit répondre honnêtement)'
};

function enabled() {
  return ai.enabled();
}

function ask(prompt, opts) {
  return ai.ask(prompt, opts);
}

function buildPrompt(kind, level, avoid) {
  return [
    'Tu animes un jeu action ou vérité entre adultes consentants (18 ans et plus) dans un groupe WhatsApp.',
    'Génère ' + KIND[kind] + '.',
    'Niveau : ' + LV[level] + '.',
    'Langue : français, ton naturel et décontracté, 1 à 2 phrases maximum.',
    'Ne demande jamais d\'envoyer des photos ou vidéos nues, ni de révéler l\'identité de quelqu\'un.',
    avoid.length ? 'Doit être différent de ceux-ci :\n- ' + avoid.join('\n- ') : '',
    'Réponds UNIQUEMENT par le texte, sans guillemets, sans numéro, sans introduction.'
  ]
    .filter(Boolean)
    .join('\n');
}

function clean(raw) {
  let t = String(raw || '').trim().split('\n').filter(Boolean)[0] || '';
  t = t.replace(/^["'«\s\-\d.)]+/, '').replace(/["'»\s]+$/, '').trim();
  return t;
}

async function generate(kind, level, chatId) {
  const key = kind + ':' + chatId;
  const list = recent.get(key) || [];
  const avoid = list.slice(-8).map((s) => s.slice(0, 80));
  const text = clean(await ask(buildPrompt(kind, level, avoid), { maxTokens: 500 }));

  if (!text || text.length < 10 || text.length > 400) throw new Error('réponse IA inutilisable');
  if (/je ne (peux|vais) pas|i can'?t|i cannot|désolé, mais|desole, mais|pollinations/i.test(text)) {
    throw new Error('refus ou réponse parasite de l\'IA');
  }

  list.push(text);
  recent.set(key, list.slice(-20));
  return text;
}

module.exports = { generate, ask, enabled };
