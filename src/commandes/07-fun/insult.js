'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'insult',
  category: 'fun',
  description: 'Insulte humoristique (leger)',
  async execute(sock, m, from) {
    const insults = [
      'Tu es aussi utile qu\'un pare-brise sur un vélo.',
      'Tu as le QI d\'une plante verte.',
      'Tu es comme une mise a jour Windows : tout le monde t\'ignore.',
      'Ton humour est aussi drole qu\'une panne de courant.',
      'Tu es la raison pour laquelle les notices disent "ne pas manger".'
    ];
    const i = insults[Math.floor(Math.random() * insults.length)];
    await sock.sendMessage(from, { text: style.renderInfo([i]) });
  }
};
