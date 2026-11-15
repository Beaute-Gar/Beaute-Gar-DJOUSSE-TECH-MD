'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'emojimix',
  aliases: ['mixemoji'],
  category: 'sticker-media',
  description: 'Mix deux emojis',
  async execute(sock, m, from, args) {
    if (args.length < 2) {
      return sock.sendMessage(from, { text: style.renderInfo(['Usage : .emojimix 😀 😎']) });
    }
    // Implementation basique : retourne les deux emojis collés
    await sock.sendMessage(from, { text: `Voici ton mix : ${args[0]}${args[1]}` });
  }
};
