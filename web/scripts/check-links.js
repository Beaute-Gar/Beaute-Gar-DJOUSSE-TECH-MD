#!/usr/bin/env node
'use strict';
/**
 * check-links.js — vérifie liens internes, ancres et ressources locales dans web/public.
 * Usage : node web/scripts/check-links.js [--base=path]
 */
const fs = require('fs');
const path = require('path');

const baseDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'public'));
const htmlFiles = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) htmlFiles.push(p);
  }
}

function collectIds(html) {
  const ids = new Set();
  const re = /\bid=["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(html))) ids.add(m[1]);
  return ids;
}

const idCache = new Map();
function idsFor(file) {
  if (!idCache.has(file)) idCache.set(file, collectIds(fs.readFileSync(file, 'utf8')));
  return idCache.get(file);
}

const errors = [];
const warnings = [];
const checked = new Set();

function resolveTarget(fromFile, href) {
  if (!href || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('data:') || href.startsWith('javascript:')) return null;
  if (href.startsWith('#')) return { file: fromFile, hash: href.slice(1) };
  const [p, hash] = href.split('#');
  const clean = p.split('?')[0];
  if (!clean) return { file: fromFile, hash: hash || '' };
  let target = clean.startsWith('/') ? path.join(baseDir, clean) : path.resolve(path.dirname(fromFile), clean);
  try {
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
  } catch {}
  return { file: target, hash: hash || '' };
}

walk(baseDir);

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(baseDir, file);
  const attrRe = /\b(?:href|src)=["']([^"']+)["']/g;
  let m;
  while ((m = attrRe.exec(html))) {
    const href = m[1].trim();
    if (!href || href === '#' || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('data:')) continue;
    if (href.startsWith('javascript:')) { warnings.push(`${rel}: lien javascript:`); continue; }
    const t = resolveTarget(file, href);
    if (!t) continue;
    const key = t.file + '#' + t.hash;
    if (checked.has(key)) continue;
    checked.add(key);
    const tRel = path.relative(baseDir, t.file) || '.';
    if (!fs.existsSync(t.file)) {
      errors.push(`${rel}: cible manquante -> ${href} (${tRel})`);
      continue;
    }
    if (t.hash) {
      const ids = idsFor(t.file);
      if (!ids.has(t.hash)) errors.push(`${rel}: ancre manquante -> ${href} (#${t.hash} absent de ${tRel})`);
    }
  }
}

// basic external placeholder warning
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(baseDir, file);
  const m = html.match(/https:\/\/\[A_REMPLIR\]/g);
  if (m) warnings.push(`${rel}: ${m.length} placeholder(s) de domaine [A_REMPLIR]`);
}

console.log(`Pages analysées: ${htmlFiles.length}`);
if (warnings.length) {
  console.log(`\nAvertissements (${warnings.length}):`);
  warnings.slice(0, 80).forEach(w => console.log('  - ' + w));
  if (warnings.length > 80) console.log(`  ... +${warnings.length - 80}`);
}
if (errors.length) {
  console.error(`\nErreurs (${errors.length}):`);
  errors.forEach(e => console.error('  - ' + e));
  process.exitCode = 1;
} else {
  console.log('\nAucun lien/ressource/ancre interne cassé détecté.');
}
