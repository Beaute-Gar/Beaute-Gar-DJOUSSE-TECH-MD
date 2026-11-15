'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'wouldyou',
  category: 'fun',
  description: 'Question "Tu preferes..."',
  async execute(sock, m, from) {
    const questions = [
      'Tu preferes etre riche mais sans amis, ou pauvre mais entoure d\'amis ?',
      'Tu preferes pouvoir voler ou etre invisible ?',
      'Tu preferes ne plus jamais utiliser les reseaux sociaux ou ne plus jamais regarder de films ?',
      'Tu preferes vivre sans musique ou sans Internet ?'
    ];
    const q = questions[Math.floor(Math.random() * questions.length)];
    await sock.sendMessage(from, { text: style.renderInfo([`Tu preferes... ${q}`]) });
  }
};
