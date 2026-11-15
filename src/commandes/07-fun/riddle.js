'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'riddle',
  aliases: ['devinette'],
  category: 'fun',
  description: 'Devinette amusante',
  async execute(sock, m, from) {
    const riddles = [
      { q: 'Qu\'est-ce qui a des dents mais ne mord pas ?', a: 'Une fourchette' },
      { q: 'Qu\'est-ce qui a des yeux mais ne voit pas ?', a: 'Une aiguille' },
      { q: 'Plus on en prend, plus on en laisse. Qu\'est-ce que c\'est ?', a: 'Des pas' },
      { q: 'Je parle toutes les langues mais je n\'ai pas de bouche. Qui suis-je ?', a: 'Un echo' }
    ];
    const r = riddles[Math.floor(Math.random() * riddles.length)];
    await sock.sendMessage(from, { text: style.renderInfo([`Devinette : ${r.q}\n(La reponse est cachee)`]) });
    setTimeout(() => sock.sendMessage(from, { text: `La reponse etait : ${r.a}` }), 10000);
  }
};
