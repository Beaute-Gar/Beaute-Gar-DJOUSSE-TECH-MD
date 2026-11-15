'use strict';

// Petit stockage JSON sécurisé (écriture atomique, jamais d'exception vers l'appelant)
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', '..', '..', 'storage', 'data');
const cache = new Map();

const file = (name) => path.join(DIR, name + '.json');

function get(name, def) {
  if (cache.has(name)) return cache.get(name);
  let v;
  try {
    v = JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch (_) {
    v = def;
  }
  if (v === null || typeof v !== 'object') v = def;
  cache.set(name, v);
  return v;
}

function save(name) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = file(name) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cache.get(name), null, 2));
    fs.renameSync(tmp, file(name));
  } catch (e) {
    console.error('[store] écriture impossible (' + name + '):', e.message);
  }
}

module.exports = { get, save };
