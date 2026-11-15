'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'time',
  aliases: ['heure'],
  category: 'outils',
  description: 'Affiche l\'heure actuelle',
  async execute(sock, m, from) {
    const now = new Date();
    const timeString = now.toLocaleTimeString('fr-FR');
    await sock.sendMessage(from, { text: style.renderInfo([`Il est actuellement : ${timeString}`]) });
  }
};
