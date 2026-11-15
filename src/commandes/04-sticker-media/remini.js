'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'remini',
  category: 'sticker-media',
  description: 'Ameliore la qualite d\'une image (simulation)',
  async execute(sock, m, from) {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const isImage = m.message?.imageMessage || quoted?.imageMessage;
    
    if (!isImage) {
      return sock.sendMessage(from, { text: style.renderError(['Repondez a une image avec .remini']) });
    }

    await sock.sendMessage(from, { text: style.renderInfo(['Fonctionnalite Remini en developpement...']) });
  }
};
