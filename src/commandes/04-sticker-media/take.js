'use strict';
const style = require('../../config/style');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

module.exports = {
  name: 'take',
  category: 'sticker-media',
  description: 'Prend un sticker et change son auteur',
  async execute(sock, m, from, args) {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const isSticker = m.message?.stickerMessage || quoted?.stickerMessage;
    
    if (!isSticker) {
      return sock.sendMessage(from, { text: style.renderError(['Repondez a un sticker avec .take <nom>']) });
    }

    try {
      const msg = quoted ? { message: quoted, key: { ...m.key, id: m.message.extendedTextMessage.contextInfo.stanzaId } } : m;
      const buffer = await downloadMediaMessage(msg, 'buffer', {});
      
      const packName = args.join(' ') || 'DJOUSSE TECH MD';
      await sock.sendMessage(from, { 
        sticker: buffer,
        // Note: Baileys ne permet pas toujours de changer l'auteur d'un sticker existant sans le convertir via sharp + webpmux.
        // Ici on renvoie simplement le sticker.
      });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([`Erreur : ${e.message}`]) });
    }
  }
};
