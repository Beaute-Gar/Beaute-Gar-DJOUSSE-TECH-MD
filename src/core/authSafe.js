'use strict';

/**
 * authSafe.js — fiabilise le stockage local de Baileys.
 *
 *  - verifie creds.json au demarrage et le restaure depuis creds.json.bak s'il
 *    est corrompu ;
 *  - copie creds.json vers creds.json.bak apres chaque sauvegarde valide ;
 *  - cree des sauvegardes chiffrees (AES-256-GCM) des creds.json.
 *
 * Ne modifie pas le format des sessions : on reste sur useMultiFileAuthState.
 */

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { promises: fsp } = fs;
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');

const ALGO = 'aes-256-gcm';

async function exists(file) {
  try {
    await fsp.access(file);
    return true;
  } catch {
    return false;
  }
}

async function validJson(file) {
  try {
    JSON.parse(await fsp.readFile(file, 'utf8'));
    return true;
  } catch {
    return false;
  }
}

async function snapshot(dir) {
  const creds = path.join(dir, 'creds.json');
  if (!(await validJson(creds))) return;

  const tmp = path.join(dir, 'creds.json.bak.tmp');
  try {
    await fsp.copyFile(creds, tmp);
    await fsp.rename(tmp, path.join(dir, 'creds.json.bak'));
  } catch (err) {
    console.error('[auth] copie de secours impossible :', err.message);
  }
}

/**
 * Ouvre une session Baileys avec verification + copie de secours.
 * Retourne { state, saveCreds, dir } comme useMultiFileAuthState, mais
 * saveCreds est serialise et met a jour creds.json.bak.
 */
async function openAuth(dir) {
  await fsp.mkdir(dir, { recursive: true });
  if (process.platform !== 'win32') {
    try { await fsp.chmod(dir, 0o700); } catch { /* droits non modifiables */ }
  }

  const creds = path.join(dir, 'creds.json');
  const bak = path.join(dir, 'creds.json.bak');

  if ((await exists(creds)) && !(await validJson(creds))) {
    const parked = `${creds}.corrupt-${Date.now()}`;
    await fsp.rename(creds, parked).catch(() => {});

    if (await validJson(bak)) {
      await fsp.copyFile(bak, creds);
      console.warn(`[auth] ${path.basename(dir)} : creds.json corrompu, restaure depuis la copie.`);
    } else {
      console.error(`[auth] ${path.basename(dir)} : creds.json corrompu, aucune copie valide. Nouveau jumelage necessaire.`);
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState(dir);

  // Premiere copie de secours des le demarrage
  if (await validJson(creds)) await snapshot(dir);

  let chain = Promise.resolve();
  const safeSave = () => {
    chain = chain
      .then(async () => {
        await saveCreds();
        await snapshot(dir);
      })
      .catch((err) => console.error('[auth] sauvegarde :', err.message));
    return chain;
  };

  return { state, saveCreds: safeSave, dir };
}

function encrypt(buffer, secret) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(secret, salt, 32);
  const cipher = crypto.createCipheriv(ALGO, key, iv, { authTagLength: 16 });
  const data = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([salt, iv, cipher.getAuthTag(), data]);
}

function decryptBackup(buffer, secret) {
  const salt = buffer.subarray(0, 16);
  const iv = buffer.subarray(16, 28);
  const tag = buffer.subarray(28, 44);
  const data = buffer.subarray(44);
  const key = crypto.scryptSync(secret, salt, 32);
  const decipher = crypto.createDecipheriv(ALGO, key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/**
 * Sauvegarde chiffree de toutes les sessions.
 * Cle : SESSION_BACKUP_KEY (16 caracteres minimum).
 */
async function backupAll(opts = {}) {
  const {
    sessionsDir,
    backupDir,
    keepDays = 7,
    secret = process.env.SESSION_BACKUP_KEY
  } = opts;

  if (!sessionsDir || !backupDir) {
    throw new Error('backupAll : sessionsDir et backupDir sont requis.');
  }
  if (!secret || secret.length < 16) {
    console.warn('[backup] SESSION_BACKUP_KEY absente ou trop courte : sauvegarde ignoree.');
    return 0;
  }

  let names = [];
  try {
    names = await fsp.readdir(sessionsDir);
  } catch {
    return 0;
  }

  const day = new Date().toISOString().slice(0, 10);
  const out = path.join(backupDir, day);
  await fsp.mkdir(out, { recursive: true, mode: 0o700 });

  let count = 0;
  for (const name of names) {
    if (!/^\d{6,15}$/.test(name)) continue;

    const creds = path.join(sessionsDir, name, 'creds.json');
    if (!(await validJson(creds))) continue;

    const encrypted = encrypt(await fsp.readFile(creds), secret);
    await fsp.writeFile(path.join(out, `${name}.creds.enc`), encrypted, { mode: 0o600 });
    count++;
  }

  const limit = Date.now() - keepDays * 86400000;
  try {
    for (const name of await fsp.readdir(backupDir)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(name) && new Date(name).getTime() < limit) {
        await fsp.rm(path.join(backupDir, name), { recursive: true, force: true });
      }
    }
  } catch (err) {
    console.error('[backup] nettoyage :', err.message);
  }

  return count;
}

module.exports = { openAuth, backupAll, decryptBackup };
