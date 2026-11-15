'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'calc',
  aliases: ['math'],
  category: 'outils',
  description: 'Calculatrice (ex: .calc 2+2)',
  async execute(sock, m, from, args) {
    const expr = args.join(' ');
    if (!expr) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .calc 2+2']) });

    try {
      // Securite basique pour eviter l'eval de code malveillant
      if (!/^[\d\s\+\-\*\/\(\)\.]+$/.test(expr)) {
        return sock.sendMessage(from, { text: style.renderError(['Expression invalide. Chiffres et operateurs uniquement.']) });
      }
      const result = eval(expr);
      await sock.sendMessage(from, { text: style.renderSuccess([`Resultat : ${expr} = ${result}`]) });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError(['Erreur de calcul.']) });
    }
  }
};
