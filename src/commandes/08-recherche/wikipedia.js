'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'wikipedia',
  category: 'recherche',
  description: 'Alias de la commande .wiki',
  async execute(sock, m, from, args) {
    const wikiCmd = require('./wiki');
    await wikiCmd.execute(sock, m, from, args);
  }
};
