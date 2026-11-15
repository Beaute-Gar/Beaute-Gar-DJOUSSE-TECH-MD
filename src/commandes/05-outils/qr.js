'use strict';
const style = require('../../config/style');
const QRCode = require('qrcode');

module.exports = {
  name: 'qr',
  category: 'outils',
  description: 'Genere un QR code a partir d\'un texte',
  async execute(sock, m, from, args) {
    const text = args.join(' ');
    if (!text) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .qr <texte>']) });

    try {
      const buffer = await QRCode.toBuffer(text, { width: 500 });
      await sock.sendMessage(from, { image: buffer, caption: `QR Code pour : ${text}` });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([`Erreur QR : ${e.message}`]) });
    }
  }
};
