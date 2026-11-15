'use strict';
const fs    = require('fs');
const path  = require('path');
const paths = require('../config/paths');

const commands   = new Map();
const aliases    = new Map();
const byCategory = new Map();

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js') && !entry.name.startsWith('_')) out.push(full);
  }
  return out;
}

function loadCommands() {
  commands.clear(); aliases.clear(); byCategory.clear();

  for (const file of walk(paths.commandes)) {
    try {
      delete require.cache[require.resolve(file)];
      const cmd = require(file);
      if (!cmd?.name || typeof cmd.execute !== 'function') continue;

      commands.set(cmd.name.toLowerCase(), cmd);
      (cmd.aliases || []).forEach(a => aliases.set(a.toLowerCase(), cmd.name.toLowerCase()));

      const cat = cmd.category || 'divers';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat).push(cmd);
    } catch (err) {
      console.error(`[command-handler] ${file}:`, err.message);
    }
  }
  console.log(`[command-handler] ${commands.size} commande(s) chargee(s)`);
}

function find(name) {
  const k = (name || '').toLowerCase();
  if (commands.has(k)) return commands.get(k);
  if (aliases.has(k)) return commands.get(aliases.get(k));
  return null;
}

module.exports = { loadCommands, find, commands, byCategory };