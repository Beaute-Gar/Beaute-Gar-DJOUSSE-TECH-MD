'use strict';
const style = require('../../config/style');
const config = require('../../config/config');

module.exports = {
  name: 'setstatus',
  aliases: ['poststatus'],
  category: 'owner',
  description: 'Poste un statut WhatsApp',
  async execute(sock, m, from, args) {
    if (!require('../../lib/auth').isOwner(sock, m, config, from)) {
      return sock.sendMessage(from, { text: style.renderError(['Reserve au proprietaire.']) });
    }
    const text = args.join(' ');
    if (!text) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .setstatus <texte>']) });

    try {
      await sock.sendMessage('status@broadcast', { text });
      await sock.sendMessage(from, { text: style.renderSuccess(['Statut poste.']) });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([e.message]) });
    }
  }
};
