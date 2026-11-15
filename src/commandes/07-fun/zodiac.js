'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'zodiac',
  aliases: ['zodiaque'],
  category: 'fun',
  description: 'Donne ton signe du zodiaque (ex: .zodiac 15 08)',
  async execute(sock, m, from, args) {
    if (args.length < 2) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .zodiac <jour> <mois>']) });
    
    const day = parseInt(args[0]);
    const month = parseInt(args[1]);
    
    if (day < 1 || day > 31 || month < 1 || month > 12) {
      return sock.sendMessage(from, { text: style.renderError(['Date invalide.']) });
    }

    const signs = [
      { name: 'Capricorne', start: [12, 22], end: [1, 19] },
      { name: 'Verseau', start: [1, 20], end: [2, 18] },
      { name: 'Poissons', start: [2, 19], end: [3, 20] },
      { name: 'Belier', start: [3, 21], end: [4, 19] },
      { name: 'Taureau', start: [4, 20], end: [5, 20] },
      { name: 'Gemeaux', start: [5, 21], end: [6, 20] },
      { name: 'Cancer', start: [6, 21], end: [7, 22] },
      { name: 'Lion', start: [7, 23], end: [8, 22] },
      { name: 'Vierge', start: [8, 23], end: [9, 22] },
      { name: 'Balance', start: [9, 23], end: [10, 22] },
      { name: 'Scorpion', start: [10, 23], end: [11, 21] },
      { name: 'Sagittaire', start: [11, 22], end: [12, 21] }
    ];

    const sign = signs.find(s => {
      if (s.start[0] === s.end[0]) {
        return month === s.start[0] && day >= s.start[1] && day <= s.end[1];
      }
      return (month === s.start[0] && day >= s.start[1]) || (month === s.end[0] && day <= s.end[1]);
    });

    if (sign) {
      await sock.sendMessage(from, { text: style.renderInfo([`Ton signe astrologique est : ${sign.name}`]) });
    } else {
      await sock.sendMessage(from, { text: style.renderError(['Impossible de determiner le signe.']) });
    }
  }
};
