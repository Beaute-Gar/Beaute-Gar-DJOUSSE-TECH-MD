'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'summarize',
  category: 'ia',
  description: 'Resume un texte long avec l\'IA',
  async execute(sock, m, from, args) {
    const text = args.join(' ');
    if (!text || text.length < 20) {
      return sock.sendMessage(from, { text: style.renderInfo(['Usage : .summarize <texte long>']) });
    }

    try {
      const prompt = `Resume ce texte en quelques phrases : ${text}`;
      const res = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`);
      const result = await res.text();

      await sock.sendMessage(from, { 
        text: style.box('RESUME', [
          `Texte original : ${text.substring(0, 50)}...`,
          `Resume : ${result.trim()}`
        ]) 
      });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([`Erreur resume : ${e.message}`]) });
    }
  }
};
