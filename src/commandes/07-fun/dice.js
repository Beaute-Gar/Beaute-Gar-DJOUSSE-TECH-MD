'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'dice',
  aliases: ['de'],
  category: 'fun',
  description: 'Lance un de a 6 faces',
  async execute(sock, m, from) {
    const result = Math.floor(Math.random() * 6) + 1;
    await sock.sendMessage(from, { text: style.renderSuccess([`🎲 Tu as fait un ${result} !`]) });
  }
};
