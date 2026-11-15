'use strict';
const style = require('../../config/style');
const config = require('../../config/config');
const db = require('../../lib/database');

module.exports = {
  name: 'setbotname',
  category: 'owner',
  description: 'Change le nom du bot',
  async execute(sock, m, from, args) {
    if (!require('../../lib/auth').isOwner(sock, m, config, from)) {
      return sock.sendMessage(from, { text: style.renderError(['Reserve au proprietaire.']) });
    }
    const name = args.join(' ');
    if (!name) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .setbotname <nom>']) });
    
    db.setSetting('botName', name);
    await sock.sendMessage(from, { text: style.renderSuccess([`Nom du bot change en : ${name}`]) });
  }
};
