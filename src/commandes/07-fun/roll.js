'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'roll',
  category: 'fun',
  description: 'Lance un de avec un nombre de faces personnalise (ex: .roll 20)',
  async execute(sock, m, from, args) {
    const faces = parseInt(args[0]) || 6;
    if (faces < 2 || faces > 1000) {
      return sock.sendMessage(from, { text: style.renderError(['Le nombre de faces doit etre entre 2 et 1000.']) });
    }
    const result = Math.floor(Math.random() * faces) + 1;
    await sock.sendMessage(from, { text: style.renderSuccess([`🎲 De a ${faces} faces : ${result}`]) });
  }
};
