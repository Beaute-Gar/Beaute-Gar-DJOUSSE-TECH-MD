'use strict';
const style = require('../../config/style');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: 'tovideo',
  category: 'sticker-media',
  description: 'Convertit un sticker anime en video',
  async execute(sock, m, from) {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const isSticker = m.message?.stickerMessage || quoted?.stickerMessage;
    
    if (!isSticker) {
      return sock.sendMessage(from, { text: style.renderError(['Repondez a un sticker avec .tovideo']) });
    }

    const tmpIn = path.join(__dirname, `../../storage/downloads/${uuidv4()}.webp`);
    const tmpOut = path.join(__dirname, `../../storage/downloads/${uuidv4()}.mp4`);

    try {
      const msg = quoted ? { message: quoted, key: { ...m.key, id: m.message.extendedTextMessage.contextInfo.stanzaId } } : m;
      const buffer = await downloadMediaMessage(msg, 'buffer', {});
      fs.writeFileSync(tmpIn, buffer);

      await new Promise((resolve, reject) => {
        ffmpeg(tmpIn).toFormat('mp4').on('end', resolve).on('error', reject).save(tmpOut);
      });

      await sock.sendMessage(from, { video: fs.readFileSync(tmpOut), mimetype: 'video/mp4' });
      fs.unlinkSync(tmpIn); fs.unlinkSync(tmpOut);
    } catch (e) {
      if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
      if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
      await sock.sendMessage(from, { text: style.renderError([`Erreur video : ${e.message}`]) });
    }
  }
};
