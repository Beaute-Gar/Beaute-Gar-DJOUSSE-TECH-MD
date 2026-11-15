'use strict';
/**
 * scripts/export-site-data.js
 * ───────────────────────────────────────────────────────────────────────────
 * Régénère les données du site (web/public/data) à partir du VRAI registre de
 * commandes chargé par le bot (src/handlers/command-handler.js).
 *
 *   node scripts/export-site-data.js          écrit les fichiers
 *   node scripts/export-site-data.js --check  affiche seulement le rapport
 *   ajouter --list pour imprimer les descriptions telles qu'elles sortiront
 *
 * Fichiers produits :
 *   web/public/data/commands.json   catalogue (nom, alias, catégorie, accès, description)
 *   web/public/data/site-data.json  stats + compteurs de catégories (le reste est conservé)
 *
 * Niveau d'accès déduit de la source de chaque commande :
 *   owner  → dossier 09-owner, `permission: 'owner'`, ou appel `isOwner(...)`
 *   admin  → appel `isAdmin(...)` (droits d'administration du groupe)
 *   public → aucune vérification de droits
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const COMMANDES_DIR = path.join(ROOT, 'src', 'commandes');
const DATA_DIR = path.join(ROOT, 'web', 'public', 'data');
const COMMANDS_FILE = path.join(DATA_DIR, 'commands.json');
const SITE_FILE = path.join(DATA_DIR, 'site-data.json');

const CHECK_ONLY = process.argv.includes('--check');

// Ordre officiel des catégories = préfixe des dossiers de src/commandes.
const CATEGORIES = [
  { slug: 'general', icon: '🌟', name: 'Général' },
  { slug: 'groupe', icon: '👥', name: 'Groupe' },
  { slug: 'protection', icon: '🛡️', name: 'Protection' },
  { slug: 'sticker-media', icon: '🖼️', name: 'Sticker & Media' },
  { slug: 'outils', icon: '🧰', name: 'Outils' },
  { slug: 'ia', icon: '🤖', name: 'IA' },
  { slug: 'fun', icon: '🎲', name: 'Fun' },
  { slug: 'recherche', icon: '🔍', name: 'Recherche' },
  { slug: 'owner', icon: '👑', name: 'Owner' },
  { slug: 'divers', icon: '📦', name: 'Divers' },
  { slug: 'telechargement', icon: '⬇️', name: 'Téléchargement' },
  { slug: 'jeux', icon: '🎮', name: 'Jeux' },
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js') && !entry.name.startsWith('_')) out.push(full);
  }
  return out;
}

function guardOf(source, cmd) {
  if (cmd && cmd.permission === 'owner') return 'owner';
  if (cmd && cmd.category === 'owner') return 'owner';
  if (/\bisOwner\s*\(/.test(source)) return 'owner';
  if (/\bisAdmin\s*\(/.test(source)) return 'admin';
  return 'public';
}

// Le registre du bot écrit les descriptions sans accents (contrainte historique
// du terminal). Le site étant public et francophone, on rétablit les accents au
// rendu, mot par mot, sans jamais toucher au code des commandes.
const ACCENTS = {
  a: 'à', actualites: 'actualités', aleatoire: 'aléatoire', ameliore: 'améliore',
  chronometre: 'chronomètre', cle: 'clé', compatibilite: 'compatibilité',
  cree: 'crée', decode: 'décode', definit: 'définit', dernieres: 'dernières',
  desactive: 'désactive', desepingle: 'désépingle', detaillee: 'détaillée',
  donnees: 'données', duree: 'durée', ecran: 'écran', epingle: 'épingle', equipe: 'équipe',
  etat: 'état', eteint: 'éteint', evalue: 'évalue', execute: 'exécute',
  genere: 'génère', gere: 'gère', interessante: 'intéressante', leger: 'léger',
  media: 'média', memoire: 'mémoire', memorise: 'mémorise', meteo: 'météo',
  modifies: 'modifiés', numero: 'numéro', numeros: 'numéros',
  personnalise: 'personnalisé', piece: 'pièce', poeme: 'poème',
  preferes: 'préfères', prefixe: 'préfixe', present: 'présent', prive: 'privé',
  proprietaire: 'propriétaire', qualite: 'qualité', reaction: 'réaction',
  redemarre: 'redémarre', redemarrer: 'redémarrer', reinitialise: 'réinitialise',
  repondre: 'répondre', reponse: 'réponse', reseaux: 'réseaux',
  resultats: 'résultats', resume: 'résume', retablit: 'rétablit', roles: 'rôles',
  sante: 'santé', serie: 'série', supprimes: 'supprimés', systeme: 'système',
  taches: 'tâches', telephone: 'téléphone', transferes: 'transférés',
  verifie: 'vérifie', video: 'vidéo',
};

function applyAccents(word) {
  const replacement = ACCENTS[word.toLowerCase()];
  if (!replacement) return word;
  if (word.length > 2 && word === word.toUpperCase()) return word; // sigle : on n'y touche pas
  return word[0] === word[0].toUpperCase()
    ? replacement[0].toUpperCase() + replacement.slice(1)
    : replacement;
}

// Ambiguïtés que le mot à mot ne peut pas trancher (dé à jouer, pas « de »).
const DESCRIPTION_FIXES = {
  dice: [['un de à', 'un dé à']],
  roll: [['un de avec', 'un dé avec']],
  tovideo: [['sticker anime', 'sticker animé']],
};

function cleanDescription(value, name) {
  const raw = String(value || '').trim().replace(/\s+/g, ' ');
  let text = raw
    .replace(/[a-zA-ZÀ-ÿ]+/g, applyAccents)
    .replace(/'/g, '’');
  for (const [from, to] of DESCRIPTION_FIXES[name] || []) text = text.split(from).join(to);
  return text || 'Description à confirmer dans le registre du bot.';
}

// ── 1. Registre réellement chargé par le bot ───────────────────────────────
const handler = require(path.join(ROOT, 'src', 'handlers', 'command-handler'));
handler.loadCommands();

const loaded = [...handler.commands.values()];
const sourceByName = new Map();
for (const file of walk(COMMANDES_DIR)) {
  let mod;
  try {
    mod = require(file);
  } catch {
    continue;
  }
  if (!mod || !mod.name) continue;
  sourceByName.set(String(mod.name).toLowerCase(), fs.readFileSync(file, 'utf8'));
}

const indexBySlug = new Map(CATEGORIES.map((item, index) => [item.slug, index]));
const problems = [];
const rows = [];

for (const cmd of loaded) {
  const slug = String(cmd.category || 'divers');
  const index = indexBySlug.get(slug);
  if (index === undefined) {
    problems.push(`catégorie inconnue « ${slug} » pour .${cmd.name}`);
    continue;
  }
  const source = sourceByName.get(String(cmd.name).toLowerCase()) || '';
  const description = cleanDescription(cmd.description, cmd.name);
  if (description.includes('\uFFFD')) problems.push(`description corrompue (UTF-8) pour .${cmd.name}`);

  const ownName = String(cmd.name).toLowerCase();
  const aliases = [...new Set((cmd.aliases || [])
    .map((alias) => String(alias).trim().toLowerCase())
    .filter((alias) => alias && alias !== ownName))].sort((a, b) => a.localeCompare(b, 'fr'));

  rows.push({
    name: ownName,
    aliases,
    category: index + 1,
    categorySlug: slug,
    access: guardOf(source, cmd),
    accessConfirmed: true,
    description,
  });
}

rows.sort((a, b) => a.category - b.category || a.name.localeCompare(b.name, 'fr'));

// Alias réellement résolubles (un alias ne doit pas écraser un nom de commande).
const names = new Set(rows.map((row) => row.name));
const aliasKeys = new Set();
for (const row of rows) for (const alias of row.aliases) if (!names.has(alias)) aliasKeys.add(alias);

const perCategory = new Map();
for (const row of rows) perCategory.set(row.categorySlug, (perCategory.get(row.categorySlug) || 0) + 1);

const catalog = {
  generatedFrom: 'src/commandes',
  registry: rows.length,
  aliases: aliasKeys.size,
  categories: CATEGORIES.length,
  partial: false,
  commands: rows,
};

// ── 2. Statistiques du site ────────────────────────────────────────────────
let site = {};
try {
  site = JSON.parse(fs.readFileSync(SITE_FILE, 'utf8'));
} catch {
  problems.push('site-data.json illisible : il sera créé à minima.');
}

site.stats = {
  ...(site.stats || {}),
  categories: CATEGORIES.length,
  commands_menu: rows.length,
  commands_registry: rows.length,
  aliases: aliasKeys.size,
  protections: Array.isArray(site.guard) ? site.guard.length : (site.stats?.protections || 0),
};

site.categories = CATEGORIES.map((item, index) => ({
  n: index + 1,
  icon: item.icon,
  name: item.name,
  count: perCategory.get(item.slug) || 0,
}));

// ── 3. Rapport ─────────────────────────────────────────────────────────────
const accessCount = rows.reduce((acc, row) => {
  acc[row.access] = (acc[row.access] || 0) + 1;
  return acc;
}, {});

console.log('── Registre ───────────────────────────────');
console.log(`commandes chargées : ${rows.length}`);
console.log(`alias résolubles   : ${aliasKeys.size}`);
console.log(`catégories         : ${CATEGORIES.length}`);
console.log('── Accès ──────────────────────────────────');
for (const level of ['public', 'admin', 'owner']) console.log(`${level.padEnd(18)} : ${accessCount[level] || 0}`);
console.log('── Catégories ─────────────────────────────');
for (const item of site.categories) console.log(`${String(item.n).padStart(2, '0')} ${item.icon} ${item.name.padEnd(18)} ${item.count}`);
if (problems.length) {
  console.log('── À vérifier ─────────────────────────────');
  for (const line of problems) console.log(`! ${line}`);
} else {
  console.log('Aucun problème détecté.');
}

if (process.argv.includes('--list')) {
  for (const row of rows) console.log(`.${row.name} — ${row.description}`);
}

if (CHECK_ONLY) {
  console.log('\n--check : aucun fichier écrit.');
  process.exit(0);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(COMMANDS_FILE, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
fs.writeFileSync(SITE_FILE, `${JSON.stringify(site, null, 2)}\n`, 'utf8');
console.log(`\n✔ ${path.relative(ROOT, COMMANDS_FILE)}`);
console.log(`✔ ${path.relative(ROOT, SITE_FILE)}`);
