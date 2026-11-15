'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'translate',
  aliases: ['tr'],
  category: 'outils',
  description: 'Traduit un texte (ex: .tr fr en Bonjour)',
  async execute(sock, m, from, args) {
    if (args.length < 3) {
      return sock.sendMessage(from, { text: style.renderInfo(['Usage : .tr <langue_src> <langue_dst> <texte>']) });
    }

    const [source, target, ...textParts] = args;
    const text = textParts.join(' ');

    try {
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${source}|${target}`);
      const data = await res.json();
      
      if (data.responseData && data.responseData.translatedText) {
        await sock.sendMessage(from, { 
          text: style.renderInfo([
            `Source (${source}) : ${text}`,
            `Traduction (${target}) : ${data.responseData.translatedText}`
          ]) 
        });
      } else {
        await sock.sendMessage(from, { text: style.renderError(['Traduction impossible.']) });
      }
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError(['Erreur API traduction.']) });
    }
  }
};
