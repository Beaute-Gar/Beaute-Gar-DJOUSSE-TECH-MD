'use strict';
const style = require('../../config/style');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

module.exports = {
  name: 'toviewonce',
  aliases: ['vo', 'ephemere'],
  category: 'sticker-media',
  description: 'Transforme un media en message vue unique',
  async execute(sock, m, from) {
    // On recupere le message cite
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const mediaMsg = quoted || m.message;
    
    const type = 
      mediaMsg.imageMessage ? 'image' :
      mediaMsg.videoMessage ? 'video' :
      mediaMsg.audioMessage ? 'audio' : null;

    if (!type) {
      return sock.sendMessage(from, { 
        text: style.renderError(['Repondez a une image, video ou audio avec .vo']) 
      });
    }

    try {
      // Telechargement du media
      const msgToDownload = quoted 
        ? { message: quoted, key: { ...m.key, id: m.message.extendedTextMessage.contextInfo.stanzaId } } 
        : m;
        
      const buffer = await downloadMediaMessage(msgToDownload, 'buffer', {});
      const mimetype = mediaMsg[`${type}Message`].mimetype;
      const caption = mediaMsg[`${type}Message`].caption || '';

      // --- L'ASTUCE POUR FORCER LA VUE UNIQUE ---
      // On construit l'objet interne du message
      const mediaContent = {
        [type]: buffer,
        mimetype: mimetype,
        caption: caption,
        viewOnce: true // La propriete cle
      };

      // On encapsule le tout dans viewOnceMessageV2 (ce que WhatsApp attend)
      const messagePayload = {
        viewOnceMessageV2: {
          message: {
            [type === 'audio' ? 'audioMessage' : `${type}Message`]: mediaContent
          }
        }
      };

      // Envoi du message
      await sock.sendMessage(from, messagePayload, { quoted: m });

    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([`Erreur : ${e.message}`]) });
    }
  }
};
