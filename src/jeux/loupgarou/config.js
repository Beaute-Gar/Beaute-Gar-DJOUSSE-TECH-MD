'use strict';

const num = (v, d) => {
  const n = parseInt(process.env[v], 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};

module.exports = {
  PREFIX: process.env.PREFIX || '.',
  MIN_PLAYERS: num('LG_MIN', 5),
  MAX_PLAYERS: num('LG_MAX', 24),
  LOBBY_MS: num('LG_LOBBY_MS', 120000),     // durée du salon d'inscription
  STEP_MS: num('LG_STEP_MS', 45000),        // temps laissé à chaque rôle la nuit
  DAY_MS: num('LG_DAY_MS', 90000),          // discussion du jour
  VOTE_MS: num('LG_VOTE_MS', 45000),        // vote du village
  HUNTER_MS: num('LG_HUNTER_MS', 30000),
  REVEAL_ROLES: String(process.env.LG_REVEAL || 'on').toLowerCase() !== 'off', // révéler le rôle des morts
  MUTE_NIGHT: String(process.env.LG_MUTE || 'on').toLowerCase() !== 'off'      // fermer le groupe la nuit (si le bot est admin)
};
