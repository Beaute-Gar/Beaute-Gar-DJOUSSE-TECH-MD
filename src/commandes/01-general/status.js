'use strict';
const style  = require('../../config/style');
const config = require('../../config/config');

module.exports = {
  name: 'status',
  category: 'general',
  description: 'Etat de la connexion',
  async execute(sock, m, from) {
    const u = sock.user;
    await sock.sendMessage(from, {
      text: style.renderInfo([
        `Connecte : ${u ? 'oui' : 'non'}`,
        `Bot ID   : ${u?.id || 'inconnu'}`,
        `Bot Name : ${u?.name || config.botName}`
      ])
    });
  }
};