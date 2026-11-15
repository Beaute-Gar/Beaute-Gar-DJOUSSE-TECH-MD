'use strict';
const style = require('../../config/style');
const config = require('../../config/config');
const db = require('../../lib/database');

module.exports = {
  name: 'self',
  category: 'owner',
  description: 'Rend le bot prive (seul le proprietaire peut l\'utiliser)',
  async execute(sock, m, from) {
    if (!require('../../lib/auth').isOwner(sock, m, config, from)) {
      return sock.sendMessage(from, { text: style.renderError(['Reserve au proprietaire.']) });
    }
    db.setSetting('mode', 'self');
    await sock.sendMessage(from, { text: style.renderSuccess(['Mode SELF (prive) active.']) });
  }
};
