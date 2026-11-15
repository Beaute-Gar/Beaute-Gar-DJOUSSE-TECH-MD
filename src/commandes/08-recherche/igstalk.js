'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'igstalk',
  category: 'recherche',
  description: 'Recherche un profil Instagram (simulation)',
  async execute(sock, m, from, args) {
    const username = args[0];
    if (!username) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .igstalk <username>']) });

    await sock.sendMessage(from, { 
      text: style.renderInfo([
        `Recherche pour @${username}...`,
        'Fonctionnalite limitee par Instagram (API non officielle).'
      ]) 
    });
  }
};
