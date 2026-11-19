'use strict';
const style = require('../../config/style');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const QrCode = require('qrcode-reader');

let Jimp;
try { const jimp = require('jimp'); Jimp = jimp.Jimp || jimp; } catch (e) { /* retire en mobile */ }

module.exports = {
  name: 'readqr',
  category: 'sticker-media',
  description: 'Lit un QR code depuis une image',
  async execute(sock, m, from) {
    if (!Jimp) {
      return sock.sendMessage(from, { text: style.renderError(['Indisponible sur la version mobile.']) });
    }
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const isImage = m.message?.imageMessage || quoted?.imageMessage;
    
    if (!isImage) {
      return sock.sendMessage(from, { text: style.renderError(['Repondez a une image de QR code avec .readqr']) });
    }

    try {
      const msg = quoted ? { message: quoted, key: { ...m.key, id: m.message.extendedTextMessage.contextInfo.stanzaId } } : m;
      const buffer = await downloadMediaMessage(msg, 'buffer', {});
      
      const image = await Jimp.read(buffer);
      const qr = new QrCode();
      
      const result = await new Promise((resolve, reject) => {
        qr.callback = (err, value) => err ? reject(err) : resolve(value);
        qr.decode(image.bitmap);
      });

      await sock.sendMessage(from, { text: style.renderSuccess([`QR Code : ${result.result}`]) });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([`Erreur lecture QR : ${e.message}`]) });
    }
  }
};