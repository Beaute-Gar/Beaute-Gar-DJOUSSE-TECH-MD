'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'vision',
  category: 'ia',
  description: 'Analyse une image avec l\'IA',
  async execute(sock, m, from) {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const isImage = m.message?.imageMessage || quoted?.imageMessage;
    
    if (!isImage) {
      return sock.sendMessage(from, { text: style.renderError(['Repondez a une image avec .vision']) });
    }

    await sock.sendMessage(from, { text: style.renderInfo(['Fonctionnalite Vision (analyse d\'image) en developpement...']) });
  }
};
