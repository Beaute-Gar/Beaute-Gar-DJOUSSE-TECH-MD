'use strict';
// Usage : node clean-package.cjs <www/nodejs>
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const f = path.join(dir, 'package.json');
const p = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
['baileys', '@adiwajshing/baileys'].forEach(function (n) {
  if (p.dependencies && p.dependencies[n]) { delete p.dependencies[n]; console.log('  - retire de package.json : ' + n); }
});
if (p.overrides) { delete p.overrides; console.log('  - retire overrides'); }
fs.writeFileSync(f, JSON.stringify(p, null, 2));
try {
  const b = JSON.parse(fs.readFileSync(path.join(dir, 'node_modules', '@whiskeysockets', 'baileys', 'package.json'), 'utf8'));
  console.log('  Baileys ' + b.version + ' | type=' + (b.type || 'commonjs') + ' | engines=' + JSON.stringify(b.engines || {}));
} catch (e) {
  console.log('  Baileys introuvable dans www\\nodejs\\node_modules : lance npm install dans www\\nodejs');
}
