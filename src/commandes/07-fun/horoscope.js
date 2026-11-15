'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'horoscope',
  aliases: ['horo'],
  category: 'fun',
  description: 'Horoscope du jour',
  async execute(sock, m, from, args) {
    const sign = args.join(' ') || 'Belier';
    const predictions = [
      'Une journee pleine de surprises vous attend.',
      'Faites attention a vos paroles aujourd\'hui.',
      'C\'est le moment ideal pour commencer un nouveau projet.',
      'Une rencontre inattendue pourrait changer votre journee.'
    ];
    const pred = predictions[Math.floor(Math.random() * predictions.length)];
    await sock.sendMessage(from, { text: style.renderInfo([`Horoscope pour ${sign} : ${pred}`]) });
  }
};
