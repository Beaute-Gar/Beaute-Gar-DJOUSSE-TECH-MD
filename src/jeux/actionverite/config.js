'use strict';

const path = require('path');

const num = (v, d) => {
  const n = parseInt(process.env[v], 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};

// Racine du projet : src/jeux/actionverite -> racine
const ROOT = path.join(__dirname, '..', '..', '..');

// Dossier de donnees du bot (storage/database), avec repli autonome.
let DATA_DIR = path.join(ROOT, 'storage', 'database');
try {
  const paths = require('../../config/paths');
  if (paths && paths.database) DATA_DIR = paths.database;
} catch (_) { /* module utilise hors du projet */ }

module.exports = {
  PREFIX: process.env.PREFIX || '.',
  REGISTER_MS: num('AV_REGISTER_MS', 30000),
  CHOICE_MS: num('AV_CHOICE_MS', 60000),
  ANSWER_MS: num('AV_ANSWER_MS', 90000),
  ROUNDS: num('AV_ROUNDS', 3),
  POINTS: num('AV_POINTS', 4),
  MIN_PLAYERS: num('AV_MIN_PLAYERS', 2),
  DEFAULT_LEVEL: ['soft', 'hot', 'extreme'].includes(process.env.AV_LEVEL) ? process.env.AV_LEVEL : 'soft',
  STATE_FILE: process.env.AV_STATE_FILE
    ? path.resolve(process.env.AV_STATE_FILE)
    : path.join(DATA_DIR, 'actionverite-state.json')
};
