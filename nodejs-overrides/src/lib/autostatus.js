'use strict';
const fs = require('fs');
const path = require('path');
const paths = require('../config/paths');

// Sur Android, la base persistante est BOT_DATA_DIR/storage/database.
// L'ancien chemin (public/storage/database) pouvait etre perdu a la mise a jour.
const configPath = path.join(paths.database, 'autostatus.json');
const legacyConfigPath = path.join(__dirname, '../../storage/database/autostatus.json');

function migrateLegacyConfig() {
  try {
    if (path.resolve(configPath) === path.resolve(legacyConfigPath)) return;
    if (fs.existsSync(configPath) || !fs.existsSync(legacyConfigPath)) return;
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.copyFileSync(legacyConfigPath, configPath);
  } catch (e) {}
}

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

/* Le Node embarque dans l'APK est compile SANS ICU : les proprietes Unicode
   \\p{Extended_Pictographic} et \\p{Regional_Indicator} levent
   "Invalid property name in character class" des le chargement du module.
   On essaye la regex moderne quand elle est supportee, sinon on utilise une
   detection equivalente par plages de code points (identique a celle deja
   utilisee par config/style.js pour la largeur des emojis). */
let EMOJI_REGEX = null;
try {
  EMOJI_REGEX = new RegExp('[\\p{Extended_Pictographic}\\p{Regional_Indicator}]', 'u');
} catch (e) {
  EMOJI_REGEX = null;
}

function hasEmojiCodePoint(text) {
  for (const ch of String(text)) {
    const cp = ch.codePointAt(0);
    if (
      (cp >= 0x1F000 && cp <= 0x1FAFF) || // emojis principaux
      (cp >= 0x2600 && cp <= 0x27BF) ||   // symboles divers
      (cp >= 0x2B00 && cp <= 0x2BFF) ||   // symboles et fleches
      (cp >= 0x2190 && cp <= 0x21FF) ||   // fleches
      (cp >= 0x2300 && cp <= 0x23FF) ||   // symboles techniques
      (cp >= 0x1F1E6 && cp <= 0x1F1FF) || // indicateurs regionaux (drapeaux)
      (cp >= 0xFE0E && cp <= 0xFE0F)      // selecteurs de variation
    ) return true;
  }
  return false;
}

// Verifie qu'une valeur est bien un emoji (et non du texte).
function isEmoji(value) {
  if (typeof value !== 'string') return false;
  const clean = value.trim();
  if (!clean || clean.length > 24) return false;
  const detected = EMOJI_REGEX ? EMOJI_REGEX.test(clean) : hasEmojiCodePoint(clean);
  if (!detected) return false;
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
    migrateLegacyConfig();
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
  hasEmojiCodePoint,
  isRandom,
  resolveReaction,
  reactionForStatus,
  pickRandomEmoji,
  load,
  save
};
