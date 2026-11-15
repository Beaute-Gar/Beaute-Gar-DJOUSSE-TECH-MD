'use strict';
const style = require('../../config/style');
const crypto = require('crypto');

module.exports = {
  name: 'md5',
  category: 'outils',
  description: 'Calcule le hash MD5 d\'un texte',
  async execute(sock, m, from, args) {
    const text = args.join(' ');
    if (!text) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .md5 <texte>']) });

    const hash = crypto.createHash('md5').update(text).digest('hex');
    await sock.sendMessage(from, { text: style.renderInfo([`MD5 de "${text}" : ${hash}`]) });
  }
};
