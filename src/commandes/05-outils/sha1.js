'use strict';
const style = require('../../config/style');
const crypto = require('crypto');

module.exports = {
  name: 'sha1',
  category: 'outils',
  description: 'Calcule le hash SHA1 d\'un texte',
  async execute(sock, m, from, args) {
    const text = args.join(' ');
    if (!text) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .sha1 <texte>']) });

    const hash = crypto.createHash('sha1').update(text).digest('hex');
    await sock.sendMessage(from, { text: style.renderInfo([`SHA1 de "${text}" : ${hash}`]) });
  }
};
