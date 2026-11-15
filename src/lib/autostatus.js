'use strict';
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../../storage/database/autostatus.json');

// Emoji interdit pour les likes de statuts : le coeur vert.
const BLOCKED_REACTIONS = ['💚'];

// Emojis surs utilises quand l'utilisateur choisit le mode aleatoire.
const SAFE_EMOJIS = [
  '❤️', '🔥', '😍', '👏', '💯', '😮', '😂', '🙌', '✨', '🎉',
  '👍', '🤩', '💥', '🥰', '😎', '🤝', '💐', '⚡', '🌟', '🫶'
];

// Like des statuts : actif par defaut, sans commande.
// Desactivable uniquement par variable d'environnement : STATUS_LIKE=false
const DEFAULT_CONFIG = {
  view: true,
  react: true,
  reaction: 'random'
};

// Nettoie l'emoji pour comparer sans les variantes invisibles.
function normalize(value) {
  return String(value || '')
    .replace(/[\uFE0F\u200D\uFE0E]/g, '')
    .trim();
}

function isBlockedReaction(value) {
  const clean = normalize(value);
  if (!clean) return false;
  return BLOCKED_REACTIONS.some((blocked) => clean.includes(normalize(blocked)));
}

// Verifie qu'une valeur est bien un emoji (et non du texte).
function isEmoji(value) {
  if (typeof value !== 'string') return false;
  const clean = value.trim();
  if (!clean || clean.length > 24) return false;
  if (!/[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(clean)) return false;
  // Refuse un melange de texte et d'emoji.
  if (/[A-Za-z0-9]/.test(clean)) return false;
  return true;
}

function pickRandomEmoji() {
  return SAFE_EMOJIS[Math.floor(Math.random() * SAFE_EMOJIS.length)];
}

// Retourne l'emoji a utiliser. Toute valeur invalide ou interdite
// retombe sur un emoji aleatoire sur.
function resolveReaction(value) {
  if (isBlockedReaction(value)) return pickRandomEmoji();
  if (typeof value === 'string') {
    const clean = value.trim();
    if (clean.toLowerCase() === 'random') return pickRandomEmoji();
    if (isEmoji(clean)) return clean;
  }
  return pickRandomEmoji();
}

function isRandom(value) {
  return String(value || '').trim().toLowerCase() === 'random';
}

// Decide de l'emoji a envoyer pour un statut, ou null si le like est coupe.
function reactionForStatus(cfg) {
  if (!cfg || cfg.react === false) return null;
  return resolveReaction(cfg.reaction);
}

function load() {
  let cfg = { ...DEFAULT_CONFIG };

  try {
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      cfg = { ...cfg, ...parsed };
    }
  } catch (e) {}

  // Reglages automatiques via .env, sans commande.
  if (String(process.env.STATUS_LIKE || '').toLowerCase() === 'false') {
    cfg.react = false;
  }
  if (process.env.STATUS_LIKE_EMOJI) {
    cfg.reaction = process.env.STATUS_LIKE_EMOJI;
  }

  return cfg;
}

function save(data) {
  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
  } catch (e) {}
}

module.exports = {
  BLOCKED_REACTIONS,
  SAFE_EMOJIS,
  isBlockedReaction,
  isEmoji,
  isRandom,
  resolveReaction,
  reactionForStatus,
  pickRandomEmoji,
  load,
  save
};
