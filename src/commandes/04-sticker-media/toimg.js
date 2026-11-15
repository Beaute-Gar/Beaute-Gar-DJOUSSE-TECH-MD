'use strict';
const style = require('../../config/style');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const sharp = require('sharp');

module.exports = {
  name: 'toimg',
  category: 'sticker-media',
  description: 'Convertit un sticker en image',
  async execute(sock, m, from) {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const isSticker = m.message?.stickerMessage || quoted?.stickerMessage;
    
    if (!isSticker) {
      return sock.sendMessage(from, { text: style.renderError(['Repondez a un sticker avec .toimg']) });
    }

    try {
      const msg = quoted ? { message: quoted, key: { ...m.key, id: m.message.extendedTextMessage.contextInfo.stanzaId } } : m;
      const buffer = await downloadMediaMessage(msg, 'buffer', {});
      
      const png = await sharp(buffer).png().toBuffer();
      await sock.sendMessage(from, { image: png, caption: 'Voici ton image !' });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([`Erreur conversion : ${e.message}`]) });
    }
  }
};
