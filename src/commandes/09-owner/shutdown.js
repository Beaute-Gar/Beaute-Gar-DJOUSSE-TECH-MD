'use strict';
const style = require('../../config/style');
const config = require('../../config/config');

module.exports = {
  name: 'shutdown',
  aliases: ['stop'],
  category: 'owner',
  description: 'Eteint le bot',
  async execute(sock, m, from) {
    if (!require('../../lib/auth').isOwner(sock, m, config, from)) {
      return sock.sendMessage(from, { text: style.renderError(['Reserve au proprietaire.']) });
    }
    await sock.sendMessage(from, { text: style.renderError(['Extinction du bot...']) });
    setTimeout(() => process.exit(1), 1000);
  }
};
