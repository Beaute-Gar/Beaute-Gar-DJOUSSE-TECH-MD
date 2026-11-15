'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'poll',
  aliases: ['sondage'],
  category: 'groupe',
  description: 'Cree un sondage',
  async execute(sock, m, from, args) {
    const parts = args.join(' ').split('|').map(s => s.trim()).filter(Boolean);
    if (parts.length < 3) {
      return sock.sendMessage(from, { text: style.renderError([
        'Usage : .poll Question | Option1 | Option2',
        'Exemple : .poll Pizza ? | Oui | Non'
      ]) });
    }
    const [question, ...options] = parts;
    try {
      await sock.sendMessage(from, {
        poll: {
          name: question,
          values: options,
          selectableCount: 1
        }
      });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([e.message]) });
    }
  }
};