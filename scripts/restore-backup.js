'use strict';

/**
 * Restaure un creds.json chiffre cree par src/core/authSafe.js.
 *
 * Usage :
 *   set SESSION_BACKUP_KEY=...
 *   node scripts/restore-backup.js <fichier.creds.enc> <numero>
 */

const path = require('path');
const { promises: fs } = require('fs');
const { decryptBackup } = require('../src/core/authSafe');

const sessionsDir = path.resolve(__dirname, '../storage/sessions');

(async () => {
  const [file, sessionId] = process.argv.slice(2);
  const secret = process.env.SESSION_BACKUP_KEY;

  if (!file || !sessionId || !secret) {
    console.error('Usage : SESSION_BACKUP_KEY=... node scripts/restore-backup.js <fichier.creds.enc> <numero>');
    process.exit(1);
  }

  const plain = decryptBackup(await fs.readFile(file), secret);
  const dir = path.join(sessionsDir, sessionId);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'creds.json'), plain);

  console.log(`creds.json restaure dans ${dir}`);
})().catch((err) => {
  console.error('Restauration impossible :', err.message);
  process.exit(1);
});
