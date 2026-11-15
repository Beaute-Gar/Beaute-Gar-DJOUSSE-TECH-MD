'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'gaytest',
  category: 'fun',
  description: 'Test humoristique',
  async execute(sock, m, from, args) {
    const target = args.join(' ') || 'toi';
    const score = Math.floor(Math.random() * 101);
    await sock.sendMessage(from, { text: style.renderInfo([`Resultat pour ${target} : ${score}%`]) });
  }
};
