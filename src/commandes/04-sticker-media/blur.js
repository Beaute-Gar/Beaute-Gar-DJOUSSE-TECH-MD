'use strict';
const style = require('../../config/style');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

let sharp;
try { sharp = require('sharp'); } catch (e) { /* retire en mobile */ }

module.exports = {
  name: 'blur',
  category: 'sticker-media',
  description: 'Floute une image',
  async execute(sock, m, from) {
    if (!sharp) {
      return sock.sendMessage(from, { text: style.renderError(['Indisponible sur la version mobile.']) });
    }
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const isImage = m.message?.imageMessage || quoted?.imageMessage;
    
    if (!isImage) {
      return sock.sendMessage(from, { text: style.renderError(['Repondez a une image avec .blur']) });
    }

    try {
      const msg = quoted ? { message: quoted, key: { ...m.key, id: m.message.extendedTextMessage.contextInfo.stanzaId } } : m;
      const buffer = await downloadMediaMessage(msg, 'buffer', {});
      
      const blurred = await sharp(buffer).blur(10).toBuffer();
      await sock.sendMessage(from, { image: blurred, caption: 'Image floutee !' });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([`Erreur : ${e.message}`]) });
    }
  }
};
