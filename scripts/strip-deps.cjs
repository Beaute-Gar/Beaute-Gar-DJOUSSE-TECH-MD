'use strict';
// Usage : node strip-deps.cjs <dossier-copie-du-bot> <dossier-du-bot-original>
const fs = require('fs');
const path = require('path');
const dest = process.argv[2];
const botPath = process.argv[3] || '';
if (!dest) { console.error('usage: node strip-deps.cjs <dest> <botPath>'); process.exit(1); }

const profile = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'mobile-profile.json'), 'utf8'));
const pkgPath = path.join(dest, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const removed = [];
['dependencies', 'optionalDependencies'].forEach(function (sec) {
  Object.keys(pkg[sec] || {}).forEach(function (d) {
    if (profile.removeDeps.indexOf(d) !== -1) { delete pkg[sec][d]; removed.push(d); }
  });
});
delete pkg.devDependencies;
delete pkg.optionalDependencies;

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    if (e.name === 'node_modules') return;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(c|m)?js$/.test(e.name) && e.name !== 'main.cjs' && e.name !== 'mobile-runtime.cjs') out.push(p);
  });
  return out;
}
const re = /['"]((?:@[\w.-]+\/)?baileys[\w.-]*)['"]/g;
const found = new Set();
walk(dest, []).forEach(function (f) {
  const txt = fs.readFileSync(f, 'utf8');
  let m; while ((m = re.exec(txt)) !== null) found.add(m[1]);
});
pkg.dependencies = pkg.dependencies || {};
found.forEach(function (name) {
  if (!pkg.dependencies[name]) {
    let v = 'latest';
    try { v = JSON.parse(fs.readFileSync(path.join(botPath, 'node_modules', name, 'package.json'), 'utf8')).version; } catch (e) { /* pas installe */ }
    pkg.dependencies[name] = v;
    console.log('  + dependance ajoutee (importee mais absente de package.json) : ' + name + '@' + v);
  }
});

pkg.main = 'main.cjs';
pkg.scripts = { start: 'node main.cjs' };
pkg.engines = { node: '>=18' };
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
console.log('  dependances retirees : ' + (removed.join(', ') || 'aucune'));
console.log('  paquet(s) Baileys detecte(s) dans le code : ' + (Array.from(found).join(', ') || 'AUCUN (a verifier)'));