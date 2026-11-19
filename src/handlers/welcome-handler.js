'use strict';
const style = require('../config/style');
const config = require('../config/config');
const db = require('../lib/database');
const { phoneOf, pretty } = require('../lib/phone');

// On essaie de charger la librairie, si elle n'est pas la, on utilisera un fallback texte
let drawWelcomeCard = null;
try {
  const canvasLib = require('catozolala-card-canvas');
  drawWelcomeCard = canvasLib.drawWelcomeCard;
} catch (e) {
  // Module retire en version mobile - fallback texte utilise
}

const DEFAULT_AVATAR = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png?q=60';
const DEFAULT_BG = 'https://i.ibb.co/Ccg2ctT/background.png';

async function handleGroupJoin(sock, update) {
  const { id, participants, action } = update;
  const settings = db.getSetting(`protection_${id}`, {});
  if (settings.welcome === false) return;

  let groupMetadata;
  try { groupMetadata = await sock.groupMetadata(id); } catch (e) { return; }

  for (const participant of (participants || [])) {
    const jid = typeof participant === 'string' ? participant : participant.id;
    if (!jid) continue;
    const phone = phoneOf(sock, groupMetadata, jid, participant && participant.phoneNumber, participant && participant.pn, participant && participant.lid);
    const label = pretty(phone || jid);
    const phoneNumber = (phone || String(jid).split('@')[0].split(':')[0]);

    let avatarUrl = DEFAULT_AVATAR;
    try { const pp = await sock.profilePictureUrl(jid, 'image'); if (pp) avatarUrl = pp; } catch (e) {}

    const contact = (groupMetadata.participants || []).find(p => p.id === jid || (p.lid && p.lid === jid));
    const displayName = contact?.notify || label;
    const memberCount = (groupMetadata.participants || []).length;

    try {
      if (action === 'add') {
        if (drawWelcomeCard) {
          const cardBuffer = await drawWelcomeCard({
            username: displayName,
            tag: `#${String(phoneNumber).slice(-4)}`,
            avatarURL: avatarUrl,
            backgroundURL: DEFAULT_BG,
            date: new Date().toLocaleDateString('fr-FR'),
            isOnline: true
          });
          await sock.sendMessage(id, {
            image: cardBuffer,
            caption: `👋 *Bienvenue ${label}* dans *${groupMetadata.subject || 'le groupe'}* !\n\n` +
                     `📊 Tu es le membre n°${memberCount}\n` +
                     `📅 ${new Date().toLocaleDateString('fr-FR')}\n\n` +
                     `> *Propulsé par ${db.getSetting('botName', config.botName)}*`,
            mentions: [jid]
          });
        } else {
          await sock.sendMessage(id, {
            text: `👋 *Bienvenue ${label}* dans *${groupMetadata.subject || 'le groupe'}* !\n` +
                  `📊 Tu es le membre n°${memberCount}.\n\n` +
                  `> *Propulsé par ${db.getSetting('botName', config.botName)}*`,
            mentions: [jid]
          });
        }
      } else if (action === 'remove') {
        if (drawWelcomeCard) {
          const cardBuffer = await drawWelcomeCard({
            username: displayName,
            tag: `#${String(phoneNumber).slice(-4)}`,
            avatarURL: avatarUrl,
            backgroundURL: DEFAULT_BG,
            date: new Date().toLocaleDateString('fr-FR'),
            isOnline: false
          });
          await sock.sendMessage(id, {
            image: cardBuffer,
            caption: `👋 *Au revoir ${label}* !\n` +
                     `Nous étions ${memberCount + 1} membres.\n\n` +
                     `> *Propulsé par ${db.getSetting('botName', config.botName)}*`,
            mentions: [jid]
          });
        } else {
          await sock.sendMessage(id, {
            text: `👋 *Au revoir ${label}* !\n` +
                  `Nous étions ${memberCount + 1} membres.\n\n` +
                  `> *Propulsé par ${db.getSetting('botName', config.botName)}*`,
            mentions: [jid]
          });
        }
      }
    } catch (error) {
      console.error(`[WELCOME ERROR] ${jid}:`, error.message);
      const textMsg = action === 'add' ? `👋 Bienvenue ${label} dans le groupe !` : `👋 Au revoir ${label} !`;
      await sock.sendMessage(id, { text: textMsg, mentions: [jid] });
    }
  }
}

module.exports = { handleGroupJoin };
