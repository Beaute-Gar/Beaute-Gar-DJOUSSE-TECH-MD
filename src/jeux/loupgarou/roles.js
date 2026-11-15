'use strict';

const ROLES = {
  loup: { label: 'Loup-Garou', emoji: '🐺', camp: 'loups', desc: 'Chaque nuit, tu votes avec les autres loups pour dévorer un villageois. Le jour, fais semblant d\'être innocent !' },
  villageois: { label: 'Villageois', emoji: '👨‍🌾', camp: 'village', desc: 'Tu n\'as aucun pouvoir. Observe, débats et vote le jour pour éliminer les loups.' },
  voyante: { label: 'Voyante', emoji: '🔮', camp: 'village', desc: 'Chaque nuit, tu peux découvrir le vrai rôle d\'un joueur. Guide le village sans te faire repérer.' },
  sorciere: { label: 'Sorcière', emoji: '🧪', camp: 'village', desc: 'Tu possèdes une potion de vie (sauver la victime des loups) et une potion de mort (empoisonner quelqu\'un), chacune utilisable une seule fois.' },
  chasseur: { label: 'Chasseur', emoji: '🏹', camp: 'village', desc: 'Si tu meurs, tu emportes immédiatement un joueur de ton choix avec toi.' },
  cupidon: { label: 'Cupidon', emoji: '💘', camp: 'village', desc: 'La première nuit, tu désignes deux amoureux. Si l\'un meurt, l\'autre meurt de chagrin.' }
};

function wolvesFor(n) {
  if (n <= 5) return 1;
  if (n <= 8) return 2;
  if (n <= 12) return 3;
  if (n <= 16) return 4;
  return 5;
}

/** Liste des rôles pour n joueurs (toujours au moins 1 loup et 1 voyante). */
function buildRoles(n) {
  const list = [];
  for (let i = 0; i < wolvesFor(n); i++) list.push('loup');
  list.push('voyante');
  if (n >= 6) list.push('sorciere');
  if (n >= 7) list.push('chasseur');
  if (n >= 8) list.push('cupidon');
  while (list.length < n) list.push('villageois');
  return list.slice(0, n);
}

module.exports = { ROLES, buildRoles, wolvesFor };
