'use strict';

const num = (v, d) => {
  const n = parseInt(process.env[v], 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};

module.exports = {
  PREFIX: process.env.PREFIX || '.',
  TIME_MS: num('QUIZ_TIME_MS', 25000),      // temps pour répondre à chaque question
  PAUSE_MS: num('QUIZ_PAUSE_MS', 3500),     // pause entre deux questions
  DEFAULT_COUNT: num('QUIZ_COUNT', 10),
  MAX_COUNT: num('QUIZ_MAX', 30),
  BASE_POINTS: num('QUIZ_POINTS', 10),
  BONUS_POINTS: num('QUIZ_BONUS', 5),       // bonus de rapidité (0 à 5 points)
  ADMIN_ONLY: String(process.env.QUIZ_ADMIN_ONLY || 'off').toLowerCase() === 'on',
  // auto = IA puis banque locale | local = banque locale seulement | ia = IA seulement (avec secours local si panne)
  SOURCE: ['auto', 'local', 'ia'].includes(process.env.QUIZ_SOURCE) ? process.env.QUIZ_SOURCE : 'auto'
};
