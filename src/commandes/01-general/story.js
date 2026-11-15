'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'story',
  aliases: ['statuspost', 'poststatus', 'poststory'],
  category: 'general',
  description: 'Publier un statut (texte, ou repondre a une image/video)',
  async execute(sock, m, from, args) {
    const text = args.join(' ').trim();
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const ctx = m.message?.extendedTextMessage?.contextInfo;

    // Recuperer la liste des contacts pour le statut (ou juste envoyer en broadcast)
    const statusJidList = undefined; // WhatsApp envoie a tous les contacts par defaut

    try {
      if (quoted?.imageMessage || quoted?.videoMessage) {
        // Statut image/video en repondant a un media
        const mediaType = quoted.imageMessage ? 'image' : 'video';
        const mimetype = quoted[mediaType + 'Message']?.mimetype;
        const caption = text || quoted[mediaType + 'Message']?.caption || '';
        // Telecharger le media depuis le message cite
        const { downloadMediaMessage } = require('@whiskeysockets/baileys');
        const buffer = await downloadMediaMessage({ key: { remoteJid: from, id: ctx.stanzaId, participant: ctx.participant }, message: quoted }, 'buffer', {});
        await sock.sendMessage('status@broadcast', {
          [mediaType]: buffer,
          mimetype: mimetype,
          caption: caption
        }, { statusJidList });
      } else if (text) {
        await sock.sendMessage('status@broadcast', { text }, { statusJidList });
      } else {
        return sock.sendMessage(from, { text: style.renderError(['Usage : .story <texte> ou repondez a une image/video avec .story']) });
      }
      await sock.sendMessage(from, { text: style.renderSuccess(['Statut publie.']) });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([e.message]) });
    }
  }
};
