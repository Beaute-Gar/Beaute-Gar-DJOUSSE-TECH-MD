'use strict';
const style = require('../../config/style');
const config = require('../../config/config');
const db = require('../../lib/database');

module.exports = {
  name: 'autoview',
  category: 'owner',
  description: 'Active/desactive la vue automatique des messages vue unique',
  async execute(sock, m, from, args) {
    if (!require('../../lib/auth').isOwner(sock, m, config, from)) {
      return sock.sendMessage(from, { text: style.renderError(['Reserve au proprietaire.']) });
    }
    const toggle = args[0]?.toLowerCase();
    if (!['on', 'off'].includes(toggle)) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .autoview on/off']) });

    db.setSetting('autoview', toggle === 'on');
    await sock.sendMessage(from, { text: style.renderSuccess([`Vue auto des "voir une fois" ${toggle === 'on' ? 'activee' : 'desactivee'}.`]) });
  }
};
