'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'gpt4',
  category: 'ia',
  description: 'Alias de la commande .ai',
  async execute(sock, m, from, args) {
    const aiCmd = require('./ai');
    await aiCmd.execute(sock, m, from, args);
  }
};
