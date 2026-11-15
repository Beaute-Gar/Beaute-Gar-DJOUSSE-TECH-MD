'use strict';
const style = require('../../config/style');
const ai = require('../../lib/ai-text');

module.exports = {
  name: 'ai',
  aliases: ['gpt', 'chat'],
  category: 'ia',
  description: 'Pose une question a l\'IA (Gemini/Groq/OpenRouter)',
  async execute(sock, m, from, args) {
    const prompt = args.join(' ');
    if (!prompt) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .ai <votre question>']) });

    try {
      await sock.sendPresenceUpdate('composing', from);
      const text = await ai.ask(prompt, { maxTokens: 600 });

      if (!text) throw new Error('Reponse vide.');

      await sock.sendMessage(from, {
        text: style.box('REPONSE IA', [
          `Question : ${prompt}`,
          `Reponse : ${text.trim()}`
        ])
      });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([`Erreur IA : ${e.message}`]) });
    }
  }
};
