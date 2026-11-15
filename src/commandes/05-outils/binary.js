'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'binary',
  aliases: ['bin'],
  category: 'outils',
  description: 'Convertit un texte en binaire',
  async execute(sock, m, from, args) {
    const text = args.join(' ');
    if (!text) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .binary <texte>']) });

    const binary = text.split('').map(char => char.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
    await sock.sendMessage(from, { text: style.renderSuccess([`Binaire : ${binary}`]) });
  }
};
