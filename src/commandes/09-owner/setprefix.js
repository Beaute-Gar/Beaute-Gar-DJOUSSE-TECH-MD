'use strict';
const style = require('../../config/style');
const config = require('../../config/config');
const db = require('../../lib/database');

module.exports = {
  name: 'setprefix',
  category: 'owner',
  description: 'Change le prefixe du bot',
  async execute(sock, m, from, args) {
    if (!require('../../lib/auth').isOwner(sock, m, config, from)) {
      return sock.sendMessage(from, { text: style.renderError(['Reserve au proprietaire.']) });
    }
    const newPrefix = args[0];
    if (!newPrefix) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .setprefix <symbole>']) });
    
    db.setSetting('prefix', newPrefix);
    await sock.sendMessage(from, { text: style.renderSuccess([`Prefixe change en : ${newPrefix}`]) });
  }
};
