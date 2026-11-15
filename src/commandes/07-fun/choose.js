'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'choose',
  aliases: ['choisir'],
  category: 'fun',
  description: 'Choisit une option au hasard',
  async execute(sock, m, from, args) {
    if (args.length < 2) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .choose <option1> <option2> ...']) });
    const choice = args[Math.floor(Math.random() * args.length)];
    await sock.sendMessage(from, { text: style.renderSuccess([`Mon choix : ${choice}`]) });
  }
};
