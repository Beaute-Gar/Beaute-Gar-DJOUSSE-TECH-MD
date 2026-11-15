'use strict';
const style = require('../../config/style');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: 'tourl',
  category: 'sticker-media',
  description: 'Genere un lien pour un media (simulation locale)',
  async execute(sock, m, from) {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const media = m.message?.imageMessage || m.message?.videoMessage || quoted?.imageMessage || quoted?.videoMessage;
    
    if (!media) {
      return sock.sendMessage(from, { text: style.renderError(['Repondez a un media avec .tourl']) });
    }

    await sock.sendMessage(from, { text: style.renderInfo(['Upload vers un serveur externe en developpement...']) });
  }
};
