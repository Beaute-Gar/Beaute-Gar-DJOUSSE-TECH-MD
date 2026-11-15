'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'rate',
  category: 'fun',
  description: 'Note quelque chose sur 10',
  async execute(sock, m, from, args) {
    const thing = args.join(' ');
    if (!thing) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .rate <chose>']) });

    const rating = Math.floor(Math.random() * 11);
    await sock.sendMessage(from, { text: style.renderInfo([`Je note "${thing}" : ${rating}/10`]) });
  }
};
