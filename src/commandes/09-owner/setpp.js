'use strict';
const style = require('../../config/style');
const config = require('../../config/config');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

module.exports = {
  name: 'setpp',
  category: 'owner',
  description: 'Change la photo de profil du bot',
  async execute(sock, m, from) {
    if (!require('../../lib/auth').isOwner(sock, m, config, from)) {
      return sock.sendMessage(from, { text: style.renderError(['Reserve au proprietaire.']) });
    }
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const isImage = m.message?.imageMessage || quoted?.imageMessage;
    
    if (!isImage) return sock.sendMessage(from, { text: style.renderError(['Repondez a une image avec .setpp']) });

    try {
      const msg = quoted ? { message: quoted, key: { ...m.key, id: m.message.extendedTextMessage.contextInfo.stanzaId } } : m;
      const buffer = await downloadMediaMessage(msg, 'buffer', {});
      
      const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      await sock.updateProfilePicture(botJid, buffer);
      await sock.sendMessage(from, { text: style.renderSuccess(['Photo de profil mise a jour.']) });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([`Erreur : ${e.message}`]) });
    }
  }
};
