'use strict';
const style = require('../../config/style');
const config = require('../../config/config');

module.exports = {
  name: 'setbio',
  category: 'owner',
  description: 'Change la bio du bot',
  async execute(sock, m, from, args) {
    if (!require('../../lib/auth').isOwner(sock, m, config, from)) {
      return sock.sendMessage(from, { text: style.renderError(['Reserve au proprietaire.']) });
    }
    const bio = args.join(' ');
    if (!bio) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .setbio <texte>']) });

    try {
      await sock.updateProfileStatus(bio);
      await sock.sendMessage(from, { text: style.renderSuccess(['Bio mise a jour.']) });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([e.message]) });
    }
  }
};
