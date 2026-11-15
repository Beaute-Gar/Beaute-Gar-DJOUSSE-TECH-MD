'use strict';
const style = require('../../config/style');
const config = require('../../config/config');
const db = require('../../lib/database');

module.exports = {
  name: 'public',
  category: 'owner',
  description: 'Rend le bot public (tout le monde peut l\'utiliser)',
  async execute(sock, m, from) {
    if (!require('../../lib/auth').isOwner(sock, m, config, from)) {
      return sock.sendMessage(from, { text: style.renderError(['Reserve au proprietaire.']) });
    }
    db.setSetting('mode', 'public');
    await sock.sendMessage(from, { text: style.renderSuccess(['Mode PUBLIC active.']) });
  }
};
