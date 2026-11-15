'use strict';
const style = require('../../config/style');
const config = require('../../config/config');

module.exports = {
  name: 'restart',
  category: 'owner',
  description: 'Redemarre le bot',
  async execute(sock, m, from) {
    if (!require('../../lib/auth').isOwner(sock, m, config, from)) {
      return sock.sendMessage(from, { text: style.renderError(['Reserve au proprietaire.']) });
    }
    await sock.sendMessage(from, { text: style.renderInfo(['Redemarrage du bot...']) });
    setTimeout(() => process.exit(0), 2000);
  }
};
