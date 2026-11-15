'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'ship',
  category: 'fun',
  description: 'Calcule la compatibilite entre deux personnes',
  async execute(sock, m, from, args) {
    if (args.length < 2) {
      return sock.sendMessage(from, { text: style.renderInfo(['Usage : .ship <personne1> <personne2>']) });
    }
    const p1 = args[0];
    const p2 = args[1];
    const love = Math.floor(Math.random() * 101);
    
    await sock.sendMessage(from, { 
      text: style.renderInfo([
        `❤️ Compatibilite entre ${p1} et ${p2} : ${love}%`,
        love > 70 ? 'C\'est le grand amour !' : love > 40 ? 'Y a du potentiel !' : 'Ca ne matche pas vraiment...'
      ]) 
    });
  }
};
