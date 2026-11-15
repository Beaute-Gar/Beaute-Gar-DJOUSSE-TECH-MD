'use strict';
const style  = require('../../config/style');
const config = require('../../config/config');

module.exports = {
  name: 'owner',
  aliases: ['proprio'],
  category: 'general',
  description: 'Contact du proprietaire',
  async execute(sock, m, from) {
    await sock.sendMessage(from, {
      text: style.renderInfo([
        `Nom    : ${config.ownerName}`,
        `Numero : ${config.ownerNumber || 'non configure'}`
      ])
    });
  }
};