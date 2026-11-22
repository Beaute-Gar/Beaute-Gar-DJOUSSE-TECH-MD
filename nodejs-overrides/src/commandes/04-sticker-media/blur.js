'use strict';
const messageStyle = require('../../utils/messageStyle');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const media = require('../../compat/media');

module.exports = {
  name: 'blur',
  category: 'sticker-media',
  description: 'Floute une image',
  async execute(sock, m, from) {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const isImage = m.message?.imageMessage || quoted?.imageMessage;

    if (!isImage) {
      return sock.sendMessage(from, { text: messageStyle.error('Repondez a une image avec .blur') });
    }

    try {
      const msg = quoted ? { message: quoted, key: { ...m.key, id: m.message.extendedTextMessage.contextInfo.stanzaId } } : m;
      const buffer = await downloadMediaMessage(msg, 'buffer', {});

      // Aucun require('sharp') au chargement : le moteur est choisi ici,
      // apres reception de l'image. Android utilise Jimp, PC garde sharp.
      const result = await media.blur(buffer, 10);
      console.log('[blur] moteur image : ' + result.engine);
      await sock.sendMessage(from, { image: result.buffer, caption: messageStyle.success('Image floutee.') });
    } catch (e) {
      console.error('[blur] erreur :', (e && e.message) || e);
      await sock.sendMessage(from, { text: messageStyle.error('Erreur : ' + ((e && e.message) || e)) });
    }
  }
};
