'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'meme',
  aliases: ['memegen'],
  category: 'fun',
  description: 'Génère un mème (aléatoire ou personnalisé via memegen.link)',
  async execute(sock, m, from, args) {
    try {
      if (args.length >= 3) {
        const template = args[0] || 'drake';
        const topText = args[1] || 'Texte haut';
        const bottomText = args.slice(2).join(' ') || 'Texte bas';
        const enc = (s) => encodeURIComponent(String(s).replace(/ /g, '_').replace(/\?/g, '~q').replace(/&/g, '~a'));
        const url = `https://api.memegen.link/images/${encodeURIComponent(template)}/${enc(topText)}/${enc(bottomText)}.png`;
        return sock.sendMessage(from, { image: { url }, caption: `Mème: ${template}` });
      }

      const res = await fetch('https://api.memegen.link/templates');
      const templates = await res.json();
      const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
      const url = `https://api.memegen.link/images/${randomTemplate.id}.png`;
      await sock.sendMessage(from, { image: { url }, caption: `Mème : ${randomTemplate.name}` });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError(['Impossible de générer le mème.']) });
    }
  }
};
