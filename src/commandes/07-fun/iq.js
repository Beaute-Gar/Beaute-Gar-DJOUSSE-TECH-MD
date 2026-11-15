'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'iq',
  category: 'fun',
  description: 'Test de QI humoristique',
  async execute(sock, m, from, args) {
    const target = args.join(' ') || 'toi';
    const iq = Math.floor(Math.random() * 100) + 50;
    await sock.sendMessage(from, { text: style.renderInfo([`QI estime de ${target} : ${iq}`]) });
  }
};
