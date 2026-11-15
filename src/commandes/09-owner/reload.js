'use strict';
const style = require('../../config/style');
const config = require('../../config/config');
const cmdHandler = require('../../handlers/command-handler');

module.exports = {
  name: 'reload',
  category: 'owner',
  description: 'Recharge les commandes sans redemarrer le bot',
  async execute(sock, m, from) {
    if (!require('../../lib/auth').isOwner(sock, m, config, from)) {
      return sock.sendMessage(from, { text: style.renderError(['Reserve au proprietaire.']) });
    }
    // Recharge le menu. Les handlers .vv gardent leur cache memoire partage
    // avec index.js ; un redemarrage complet est requis pour la persistance disque.
    try { delete require.cache[require.resolve('../../lib/menu-ui')]; } catch (e) {}
    cmdHandler.loadCommands();
    await sock.sendMessage(from, { text: style.renderSuccess([`Commandes rechargees : ${cmdHandler.commands.size}`]) });
  }
};
