'use strict';
const style = require('../../config/style');
const config = require('../../config/config');
const db = require('../../lib/database');
const { isGroup, getGroupMeta, isAdmin, normalizeJid } = require('../../lib/helpers');
const { phoneOf, pretty } = require('../../lib/phone');
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

      let meta = null;
      if (isGroup(from)) {
        try { meta = await getGroupMeta(sock, from); } catch (e) {}
      }

      // Résolution propre du numéro (LID -> vrai numéro de téléphone via phoneOf)
      const alt = m.message?.extendedTextMessage?.contextInfo;
      let resolvedPhone = phoneOf(sock, meta, target, alt?.participantAlt, alt?.participantPn);
      if (!resolvedPhone) {
        const norm = normalizeJid(target);
        if (norm && norm.length <= 15 && !target.includes('@lid')) {
          resolvedPhone = norm;
        }
      }

      let displayNumber = resolvedPhone ? ('+' + resolvedPhone) : 'Numéro masqué';
      let country = 'Inconnu';
      if (resolvedPhone) {
        try {
          const parsed = parsePhoneNumberFromString('+' + resolvedPhone);
          if (parsed && parsed.country) country = parsed.country;
        } catch (e) {}
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

      function getFlagEmoji(countryCode) {
        if (!countryCode || countryCode.length !== 2) return '';
        try {
          const codePoints = countryCode
            .toUpperCase()
            .split('')
            .map(char => 127397 + char.charCodeAt(0));
          return String.fromCodePoint(...codePoints);
        } catch (_) { return ''; }
      }

      const flag = (country && country !== 'Inconnu') ? getFlagEmoji(country) : '';
      const countryStr = country + (flag ? ' ' + flag : '');
      const isAdminRole = role === 'Administrateur';
      const roleStr = role + (isAdminRole ? ' 👑' : ' 👤');

      const lines = [
        '',
        `👤 Nom : ${displayName}`,
        `📱 Numéro : ${displayNumber}`,
        `🌍 Pays : ${countryStr}`,
        `🎖️ Rôle : ${roleStr}`,
        ''
      ];

      if (groupInfo) {
        lines.push(`👥 Groupe : ${groupInfo.name}`);
        lines.push(`📊 Membres : ${groupInfo.members} (👑 Admins : ${groupInfo.admins})`);
        lines.push('');
      }

      const finalText = style.box('PROFIL DU MEMBRE', lines);

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
