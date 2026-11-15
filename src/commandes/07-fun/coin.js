'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'coin',
  aliases: ['pile'],
  category: 'fun',
  description: 'Lance une piece (Pile ou Face)',
  async execute(sock, m, from) {
    const result = Math.random() < 0.5 ? 'Pile' : 'Face';
    await sock.sendMessage(from, { text: style.renderSuccess([`🪙 Resultat : ${result}`]) });
  }
};
