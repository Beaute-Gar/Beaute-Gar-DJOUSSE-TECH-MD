'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'random',
  aliases: ['rand'],
  category: 'outils',
  description: 'Genere un nombre aleatoire (ex: .random 1 100)',
  async execute(sock, m, from, args) {
    const min = parseInt(args[0]) || 1;
    const max = parseInt(args[1]) || 100;

    if (min >= max) return sock.sendMessage(from, { text: style.renderError(['La valeur minimale doit etre inferieure au maximum.']) });

    const result = Math.floor(Math.random() * (max - min + 1)) + min;
    await sock.sendMessage(from, { text: style.renderSuccess([`Nombre aleatoire entre ${min} et ${max} : ${result}`]) });
  }
};
