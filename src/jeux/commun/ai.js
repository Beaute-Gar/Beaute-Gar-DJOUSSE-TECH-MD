'use strict';

/**
 * Accès texte IA des jeux.
 *
 * On réutilise la passerelle du bot (src/lib/ai-text.js) pour profiter de la
 * même chaîne de secours : Anthropic -> Gemini -> Groq -> OpenRouter -> Pollinations.
 * Désactivable avec GAMES_AI=off (ou AV_AI=off).
 */
const gateway = require('../../lib/ai-text');

function enabled() {
  const games = String(process.env.GAMES_AI || 'on').toLowerCase() !== 'off';
  return games && gateway.enabled() && typeof fetch === 'function';
}

async function ask(prompt, opts) {
  if (!enabled()) throw new Error('IA désactivée (GAMES_AI=off)');
  return gateway.ask(prompt, opts);
}

module.exports = { ask, enabled };
