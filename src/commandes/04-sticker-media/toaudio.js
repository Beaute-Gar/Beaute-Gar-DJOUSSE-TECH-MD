'use strict';
const style = require('../../config/style');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: 'toaudio',
  category: 'sticker-media',
  description: 'Convertit une video en audio',
  async execute(sock, m, from) {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const isVideo = m.message?.videoMessage || quoted?.videoMessage;
    
    if (!isVideo) {
      return sock.sendMessage(from, { text: style.renderError(['Repondez a une video avec .toaudio']) });
    }

    const tmpIn = path.join(__dirname, `../../storage/downloads/${uuidv4()}.mp4`);
    const tmpOut = path.join(__dirname, `../../storage/downloads/${uuidv4()}.mp3`);

    try {
      const msg = quoted ? { message: quoted, key: { ...m.key, id: m.message.extendedTextMessage.contextInfo.stanzaId } } : m;
      const buffer = await downloadMediaMessage(msg, 'buffer', {});
      fs.writeFileSync(tmpIn, buffer);

      await new Promise((resolve, reject) => {
        ffmpeg(tmpIn).toFormat('mp3').on('end', resolve).on('error', reject).save(tmpOut);
      });

      await sock.sendMessage(from, { audio: fs.readFileSync(tmpOut), mimetype: 'audio/mp4' });
      fs.unlinkSync(tmpIn); fs.unlinkSync(tmpOut);
    } catch (e) {
      if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
      if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
      await sock.sendMessage(from, { text: style.renderError([`Erreur audio : ${e.message}`]) });
    }
  }
};
