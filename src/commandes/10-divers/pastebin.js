'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'pastebin',
  category: 'divers',
  description: 'Genere un lien pour partager du texte (via dpaste.org)',
  async execute(sock, m, from, args) {
    const text = args.join(' ');
    if (!text) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .pastebin <texte>']) });

    try {
      // Utilisation de l'API gratuite dpaste.org (sans cle)
      const res = await fetch('https://dpaste.org/api/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `content=${encodeURIComponent(text)}&format=json`
      });
      
      const data = await res.json();
      if (data.url) {
        await sock.sendMessage(from, { text: style.renderSuccess([`Lien genere : ${data.url}`]) });
      } else {
        throw new Error('Lien non genere.');
      }
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError(['Erreur Pastebin.']) });
    }
  }
};
