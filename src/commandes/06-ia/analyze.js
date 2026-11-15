'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'analyze',
  aliases: ['analyse'],
  category: 'ia',
  description: 'Analyse un texte avec l\'IA',
  async execute(sock, m, from, args) {
    const text = args.join(' ');
    if (!text) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .analyze <texte>']) });

    try {
      const prompt = `Analyse ce texte (ton, sentiment, points cles) : ${text}`;
      const res = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`);
      const result = await res.text();

      await sock.sendMessage(from, { 
        text: style.box('ANALYSE', [
          `Texte : ${text.substring(0, 50)}...`,
          `Analyse : ${result.trim()}`
        ]) 
      });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([`Erreur analyse : ${e.message}`]) });
    }
  }
};
