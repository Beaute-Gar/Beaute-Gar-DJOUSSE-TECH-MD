'use strict';
const fs   = require('fs');
const path = require('path');
const paths = require('../config/paths');

if (!fs.existsSync(paths.database)) fs.mkdirSync(paths.database, { recursive: true });

function readJson(name) {
  const file = path.join(paths.database, `${name}.json`);
  if (!fs.existsSync(file)) return {};
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return {}; }
}

function writeJson(name, data) {
  fs.writeFileSync(path.join(paths.database, `${name}.json`), JSON.stringify(data, null, 2));
}

module.exports = {
  get: readJson,
  set: writeJson,
  getSetting: (k, def) => (readJson('settings')[k] ?? def),
  setSetting: (k, v) => {
    const s = readJson('settings');
    s[k] = v;
    writeJson('settings', s);
  }
};