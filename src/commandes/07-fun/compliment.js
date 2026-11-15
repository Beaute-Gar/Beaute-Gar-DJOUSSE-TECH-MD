'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'compliment',
  aliases: ['complimente'],
  category: 'fun',
  description: 'Fait un compliment aleatoire',
  async execute(sock, m, from) {
    const compliments = [
      'Tu es une personne incroyable !',
      'Tu as un sourire magnifique.',
      'Tu es plus intelligent(e) que tu ne le penses.',
      'Le monde est meilleur avec toi.',
      'Tu as un coeur en or.'
    ];
    const c = compliments[Math.floor(Math.random() * compliments.length)];
    await sock.sendMessage(from, { text: style.renderSuccess([c]) });
  }
};
