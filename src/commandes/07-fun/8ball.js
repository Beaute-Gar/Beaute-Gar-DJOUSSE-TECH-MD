'use strict';
const style = require('../../config/style');

module.exports = {
  name: '8ball',
  category: 'fun',
  description: 'Pose une question a la boule magique',
  async execute(sock, m, from, args) {
    const question = args.join(' ');
    if (!question) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .8ball <question>']) });

    const answers = [
      'Oui, absolument !', 'Non, definitivement.', 'Peut-etre...', 
      'Je ne peux pas repondre maintenant.', 'C\'est certain.', 
      'Ne compte pas la-dessus.', 'Les signes pointent vers oui.', 
      'Demande a nouveau plus tard.', 'Tres douteux.'
    ];
    const answer = answers[Math.floor(Math.random() * answers.length)];
    
    await sock.sendMessage(from, { 
      text: style.renderInfo([
        `Question : ${question}`,
        `Reponse : ${answer}`
      ]) 
    });
  }
};
