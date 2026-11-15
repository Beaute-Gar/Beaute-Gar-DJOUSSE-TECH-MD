'use strict';
// Gestion de l'authentification (pairing code) + helpers propriétaire
const db = require('./database');
const { normalizePhone, promptPhoneRaw, promptConfirm } = require('./phone');

function normalizeNumber(value) {
  return String(value || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function getBotNumber(sock) {
  const fromSock = sock && sock.user && sock.user.id ? normalizeNumber(sock.user.id) : '';
  const fromDb = normalizeNumber(db.getSetting('botNumber', ''));
  return fromSock || fromDb;
}

function getOwnerNumber(config) {
  // OWNER_NUMBER peut être fixe (env) ou dynamique (numéro de connexion = botNumber)
  const fromConfig = normalizeNumber(config && config.ownerNumber);
  const fromDb = normalizeNumber(db.getSetting('ownerNumber', '') || db.getSetting('botNumber', ''));
  return fromConfig || fromDb;
}

function isOwner(sock, m, config, from) {
  if (!m || !m.key) return false;
  if (m.key.fromMe) return true;

  const bot = getBotNumber(sock);
  const owner = getOwnerNumber(config);
  const sender = normalizeNumber(m.key.participant || from || m.key.remoteJid || '');
  if (!sender) return false;

  return !!((bot && sender === bot) || (owner && sender === owner));
}

async function askPhoneNumber(config, style) {
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(style.box(config.botName + ' | AUTH', [
      'Numero WhatsApp international',
      'Saisissez les chiffres (le + est automatique)',
      `Tentative ${attempt}/${MAX_ATTEMPTS}`
    ]));

    const digits = await promptPhoneRaw();
    if (!digits || digits.length < 8) {
      console.log(style.renderError(['Trop court (8 chiffres minimum).']));
      continue;
    }

    const result = normalizePhone('+' + digits);
    if (!result.ok) {
      console.log(style.renderError([result.error || 'Numero invalide.']));
      continue;
    }

    console.log(style.renderInfo([
      `Formate  : ${result.formatted}`,
      `Pays     : ${result.country || 'non determine'}`
    ]));

    const ok = await promptConfirm();
    if (ok) return result.number;
  }
  process.exit(1);
}

module.exports = { askPhoneNumber, isOwner, getBotNumber, getOwnerNumber, normalizeNumber };
