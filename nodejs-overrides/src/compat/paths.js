'use strict';

/**
 * compat/paths.js — couche unique de gestion des chemins et des fichiers temporaires.
 *
 * Android / CapacitorNodeJS : le Node integre utilise /tmp comme dossier temporaire.
 * Ce chemin n'est pas accessible en ecriture dans le stockage prive de l'application
 * (EACCES sur `/tmp/image...-enc` dans Baileys). On redirige donc TOUS les temporaires
 * vers <BOT_DATA_DIR>/tmp, et on met a jour TMPDIR/TMP/TEMP ainsi que os.tmpdir().
 *
 * Windows / Linux : aucun changement de comportement, on conserve le tmpdir natif.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const MOBILE = process.env.MOBILE === '1' || process.platform === 'android';
const MAX_AGE_MS = 60 * 60 * 1000; // 1 heure
const PREFIX = 'djo_' + process.pid + '_';
const LEGACY_TMP = '/tmp';

let dataDir = process.env.BOT_DATA_DIR || null;
let tmpDir = null;
let installed = false;

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* ignore */ }
  return dir;
}

function cleanupStale(dir) {
  let now = Date.now();
  let removed = 0;
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!name.startsWith(PREFIX)) continue;
      const full = path.join(dir, name);
      try {
        const st = fs.statSync(full);
        if (now - st.mtimeMs > MAX_AGE_MS) {
          if (st.isDirectory()) fs.rmSync(full, { recursive: true, force: true });
          else fs.unlinkSync(full);
          removed++;
        }
      } catch (e) { /* ignore */ }
    }
  } catch (e) { /* ignore */ }
  return removed;
}

/* Baileys importe `tmpdir` et `createWriteStream` depuis des modules ESM
   natifs (`os`, `fs`). Le simple remplacement de os.tmpdir() ne suffit pas
   sur tous les runtimes Android : l'import ESM peut conserver le `/tmp`
   d'origine. On redirige donc AUSSI les appels fs qui pointent vers /tmp
   vers notre dossier prive. C'est la correction definitive de l'EACCES
   `open '/tmp/image...-enc'` observe sur le telephone. */
function remapPath(p) {
  if (!MOBILE || !tmpDir) return p;
  if (p === LEGACY_TMP) return tmpDir;
  if (typeof p === 'string' && p.startsWith(LEGACY_TMP + '/')) {
    return path.join(tmpDir, p.slice(LEGACY_TMP.length + 1));
  }
  if (Buffer.isBuffer(p)) {
    const s = p.toString();
    if (s === LEGACY_TMP) return Buffer.from(tmpDir);
    if (s.startsWith(LEGACY_TMP + '/')) return Buffer.from(remapPath(s));
  }
  return p;
}

function wrapFsTemp() {
  if (fs.__djoTmpRedirect) return false;
  try { fs.__djoTmpRedirect = true; } catch (e) { return false; }

  const patch = (obj, names) => {
    for (const name of names) {
      try {
        const orig = obj[name];
        if (typeof orig !== 'function') continue;
        obj[name] = function () {
          arguments[0] = remapPath(arguments[0]);
          return orig.apply(this, arguments);
        };
      } catch (e) { /* propriete non modifiable : on continue */ }
    }
  };

  patch(fs, [
    'open', 'openSync', 'readFile', 'readFileSync', 'writeFile', 'writeFileSync',
    'stat', 'statSync', 'lstat', 'lstatSync', 'unlink', 'unlinkSync',
    'rename', 'renameSync', 'mkdir', 'mkdirSync', 'rmdir', 'rmdirSync',
    'access', 'accessSync', 'existsSync', 'readdir', 'readdirSync',
    'copyFile', 'copyFileSync', 'createReadStream', 'createWriteStream',
    'realpath', 'realpathSync'
  ]);
  if (fs.promises) patch(fs.promises, Object.keys(fs.promises));

  try {
    const mod = require('module');
    if (typeof mod.syncBuiltinESMExports === 'function') mod.syncBuiltinESMExports();
  } catch (e) { /* ignore */ }
  return true;
}

/**
 * Initialise la couche de compatibilite. A appeler une seule fois, tres tot,
 * avant le chargement de Baileys (qui utilise os.tmpdir() via un import ESM).
 */
function init(baseDir) {
  if (baseDir) dataDir = baseDir;
  if (installed) return { mobile: MOBILE, tmpdir: tmpDir || os.tmpdir(), already: true };
  installed = true;

  if (!MOBILE) {
    tmpDir = os.tmpdir();
    return { mobile: false, tmpdir: tmpDir, already: false };
  }

  tmpDir = ensureDir(path.join(dataDir || path.join(os.homedir(), '.djoussetech'), 'tmp'));
  const stale = cleanupStale(tmpDir);

  // Les bibliotheques qui respectent les variables d'environnement.
  process.env.TMPDIR = tmpDir;
  process.env.TMP = tmpDir;
  process.env.TEMP = tmpDir;

  const fsRedirected = wrapFsTemp();

  // Baileys importe { tmpdir } depuis 'os'. On remplace la fonction AVANT
  // l'import ESM puis on synchronise les exports ESM du module natif.
  try {
    os.tmpdir = function () { return tmpDir; };
    const mod = require('module');
    if (typeof mod.syncBuiltinESMExports === 'function') mod.syncBuiltinESMExports();
  } catch (e) {
    console.error('[compat/paths] synchronisation os.tmpdir impossible : ' + e.message);
  }

  console.log('[compat/paths] Android : TMPDIR/TMP/TEMP, os.tmpdir et fs /tmp -> ' +
              tmpDir + ' (fichiers anciens nettoyes : ' + stale + ', redirection fs : ' + fsRedirected + ')');
  return { mobile: true, tmpdir: tmpDir, already: false, stale, fsRedirected };
}

function tmpdir() {
  return tmpDir || os.tmpdir();
}

/** Chemin unique par session/processus : evite les collisions entre sessions. */
function tempFile(prefix, extension) {
  const dir = ensureDir(tmpdir());
  const name = PREFIX + String(prefix || 'tmp').replace(/[^\w.-]/g, '_') + '_' +
    crypto.randomBytes(6).toString('hex') + (extension || '');
  return path.join(dir, name);
}

module.exports = {
  isMobile: MOBILE,
  init,
  tmpdir,
  tempFile,
  cleanupStale,
  get dataDir() { return dataDir; }
};
