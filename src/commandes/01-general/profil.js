'use strict';
const style = require('../../config/style');
const config = require('../../config/config');
const db = require('../../lib/database');
const { isGroup, getGroupMeta, isAdmin, normalizeJid } = require('../../lib/helpers');
const { parsePhoneNumberFromString } = require('libphonenumber-js');
const axios = require('axios');

module.exports = {
  name: 'profil',
  aliases: ['fiche', 'profile'],
  category: 'general',
  description: 'Affiche la fiche d\'un membre',
  async execute(sock, m, from) {
    try {
      const mentions = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const quoted = m.message?.extendedTextMessage?.contextInfo?.participant;
      
      const myNumber = db.getSetting('botNumber');
      const isMe = mentions.length === 0 && !quoted;
      
      let target = isMe ? (myNumber + '@s.whatsapp.net') : (mentions[0] || quoted);
      
      if (!target) {
        return sock.sendMessage(from, { text: style.renderError(['Mentionnez quelqu\'un.']) });
      }

      let phoneNumber = normalizeJid(target);
      let displayNumber = "Prive";
      let country = "Inconnu";
      
      if (isMe || phoneNumber === myNumber) {
        displayNumber = "+" + myNumber;
        try {
          const parsed = parsePhoneNumberFromString('+' + myNumber);
          if (parsed) country = parsed.country || "Inconnu";
        } catch (e) {}
      } else {
        if (phoneNumber.length <= 15) {
          displayNumber = "+" + phoneNumber;
          try {
            const parsed = parsePhoneNumberFromString('+' + phoneNumber);
            if (parsed) country = parsed.country || "Inconnu";
          } catch (e) {}
        } else {
          displayNumber = "Masque";
        }
      }

      let displayName = isMe ? config.botName : (sock.store?.contacts?.[target]?.notify || 'Inconnu');

      let role = 'Membre';
      let groupInfo = null;
      if (isGroup(from)) {
        const meta = await getGroupMeta(sock, from);
        if (meta) {
          if (isAdmin(meta, target)) role = 'Administrateur';
          groupInfo = {
            name: meta.subject,
            members: meta.participants.length,
            admins: meta.participants.filter(p => p.admin).length,
          };
        }
      }

      // Photo de profil
      let profilePicBuffer = null;
      try {
        const ppUrl = await sock.profilePictureUrl(target, 'image');
        if (ppUrl) {
          const res = await axios.get(ppUrl, { responseType: 'arraybuffer' });
          profilePicBuffer = Buffer.from(res.data, 'binary');
        }
      } catch (e) {}

      const lines = [
        `Nom      : ${displayName}`,
        `Numero   : ${displayNumber}`,
        `Pays     : ${country}`,
        `Role     : ${role}`,
        `───────────────────────`,
        `Messages : 0 (en dev)`,
        `Classement : N/A`,
      ];

      if (groupInfo) {
        lines.push(`───────────────────────`);
        lines.push(`Groupe   : ${groupInfo.name}`);
        lines.push(`Membres  : ${groupInfo.members}`);
        lines.push(`Admins   : ${groupInfo.admins}`);
      }

      const finalText = style.box('FICHE MEMBRE', lines);

      if (profilePicBuffer) {
        await sock.sendMessage(from, {
          image: profilePicBuffer,
          caption: finalText,
          mentions: [target]
        });
      } else {
        await sock.sendMessage(from, {
          text: finalText,
          mentions: [target]
        });
      }
    } catch (globalError) {
      await sock.sendMessage(from, { text: `Erreur commande : ${globalError.message}` });
    }
  }
};
