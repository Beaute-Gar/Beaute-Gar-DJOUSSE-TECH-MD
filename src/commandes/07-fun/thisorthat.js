'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'thisorthat',
  aliases: ['tst'],
  category: 'fun',
  description: 'Choix entre deux options',
  async execute(sock, m, from, args) {
    if (args.length < 2) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .thisorthat <option1> <option2>']) });
    const choice = Math.random() < 0.5 ? args[0] : args[1];
    await sock.sendMessage(from, { text: style.renderSuccess([`Je choisis : ${choice}`]) });
  }
};
