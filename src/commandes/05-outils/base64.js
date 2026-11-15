'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'base64',
  category: 'outils',
  description: 'Encode ou decode en base64 (ex: .base64 encode texte)',
  async execute(sock, m, from, args) {
    const mode = args[0]?.toLowerCase();
    const text = args.slice(1).join(' ');

    if (!mode || !text || !['encode', 'decode'].includes(mode)) {
      return sock.sendMessage(from, { text: style.renderInfo(['Usage : .base64 encode|decode <texte>']) });
    }

    try {
      let result;
      if (mode === 'encode') {
        result = Buffer.from(text).toString('base64');
      } else {
        result = Buffer.from(text, 'base64').toString('utf-8');
      }
      await sock.sendMessage(from, { text: style.renderSuccess([`Resultat (${mode}) : ${result}`]) });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError(['Erreur de conversion.']) });
    }
  }
};
