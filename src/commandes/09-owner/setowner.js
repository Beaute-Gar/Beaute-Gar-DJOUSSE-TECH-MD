'use strict';
const style = require('../../config/style');
const config = require('../../config/config');
const db = require('../../lib/database');

module.exports = {
  name: 'setowner',
  category: 'owner',
  description: 'Change le proprietaire du bot',
  async execute(sock, m, from, args) {
    if (!require('../../lib/auth').isOwner(sock, m, config, from)) {
      return sock.sendMessage(from, { text: style.renderError(['Reserve au proprietaire.']) });
    }
    const newOwner = args[0];
    if (!newOwner) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .setowner <numero>']) });

    db.setSetting('ownerNumber', newOwner);
    await sock.sendMessage(from, { text: style.renderSuccess([`Proprietaire change en : ${newOwner}`]) });
  }
};
