'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'quote',
  category: 'fun',
  description: 'Citation inspirante',
  async execute(sock, m, from) {
    try {
      const res = await fetch('https://zenquotes.io/api/random');
      const data = await res.json();
      await sock.sendMessage(from, { text: style.renderInfo([`"${data[0].q}" - ${data[0].a}`]) });
    } catch (e) {
      // Fallback local
      const quotes = [
        'Le succes, c\'est tomber sept fois et se relever huit.',
        'La vie est un mystere qu\'il faut vivre, et non un probleme a resoudre.',
        'Le seul moyen de faire du bon travail est d\'aimer ce que vous faites.'
      ];
      const q = quotes[Math.floor(Math.random() * quotes.length)];
      await sock.sendMessage(from, { text: style.renderInfo([q]) });
    }
  }
};
