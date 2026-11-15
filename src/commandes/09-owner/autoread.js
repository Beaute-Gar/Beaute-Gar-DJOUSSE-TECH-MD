'use strict';
const style = require('../../config/style');
const config = require('../../config/config');
const db = require('../../lib/database');

module.exports = {
  name: 'autoread',
  category: 'owner',
  description: 'Active/desactive la lecture automatique',
  async execute(sock, m, from, args) {
    if (!require('../../lib/auth').isOwner(sock, m, config, from)) {
      return sock.sendMessage(from, { text: style.renderError(['Reserve au proprietaire.']) });
    }
    const toggle = args[0]?.toLowerCase();
    if (!['on', 'off'].includes(toggle)) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .autoread on/off']) });

    db.setSetting('autoread', toggle === 'on');
    await sock.sendMessage(from, { text: style.renderSuccess([`Lecture auto ${toggle === 'on' ? 'activee' : 'desactivee'}.`]) });
  }
};
