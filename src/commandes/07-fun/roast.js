'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'roast',
  category: 'fun',
  description: 'Roast humoristique',
  async execute(sock, m, from, args) {
    const target = args.join(' ') || 'toi';
    const roasts = [
      `Tu es tellement lent que même un escargot te doublerait.`,
      `Ton style est aussi unique qu\'une copie de Windows.`,
      `Tu as le charisme d\'une chaise en plastique.`
    ];
    const r = roasts[Math.floor(Math.random() * roasts.length)];
    await sock.sendMessage(from, { text: style.renderInfo([`Roast de ${target} : ${r}`]) });
  }
};
