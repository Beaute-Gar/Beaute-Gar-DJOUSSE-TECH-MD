'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'date',
  category: 'outils',
  description: 'Affiche la date actuelle',
  async execute(sock, m, from) {
    const now = new Date();
    const dateString = now.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    await sock.sendMessage(from, { text: style.renderInfo([`Nous sommes le : ${dateString}`]) });
  }
};
