'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'imagine',
  aliases: ['imagine', 'dalle'],
  category: 'ia',
  description: 'Genere une image avec l\'IA (sans cle API)',
  async execute(sock, m, from, args) {
    const prompt = args.join(' ');
    if (!prompt) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .imagine <description>']) });

    try {
      // API publique gratuite (Pollinations.ai)
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?nologo=true&width=1024&height=1024`;
      
      await sock.sendMessage(from, { 
        image: { url: url }, 
        caption: `Image generee pour : ${prompt}`
      });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([`Erreur generation image : ${e.message}`]) });
    }
  }
};
