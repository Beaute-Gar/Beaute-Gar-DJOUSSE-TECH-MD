'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'fact',
  aliases: ['funfact'],
  category: 'fun',
  description: 'Anecdote interessante (API gratuite)',
  async execute(sock, m, from) {
    try {
      const res = await fetch('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en');
      const data = await res.json();
      await sock.sendMessage(from, { text: style.renderInfo([`Le savais-tu ? ${data.text}`]) });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError(['Impossible de recuperer une anecdote.']) });
    }
  }
};
