'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'wiki',
  aliases: ['wikipedia'],
  category: 'recherche',
  description: 'Recherche un article sur Wikipedia',
  async execute(sock, m, from, args) {
    const query = args.join(' ');
    if (!query) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .wiki <sujet>']) });

    try {
      const res = await fetch(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('Article introuvable');
      
      const data = await res.json();
      const extract = data.extract || 'Aucun resume disponible.';
      
      await sock.sendMessage(from, { 
        text: style.box('WIKIPEDIA', [
          `Sujet : ${data.title}`,
          `Resume : ${extract}`
        ]) 
      });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([`Erreur Wikipedia : ${e.message}`]) });
    }
  }
};
