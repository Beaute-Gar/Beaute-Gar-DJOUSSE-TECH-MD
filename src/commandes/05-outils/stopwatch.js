'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'stopwatch',
  aliases: ['chrono'],
  category: 'outils',
  description: 'Chronometre simple',
  async execute(sock, m, from) {
    const start = Date.now();
    await sock.sendMessage(from, { text: '⏱️ Chronometre lance. Tapez .stopwatch pour arreter.' });
    
    // Note: Une implementation reelle necessiterait un etat global par groupe.
    // Ici on fait une simulation basique.
    setTimeout(async () => {
      const duration = (Date.now() - start) / 1000;
      await sock.sendMessage(from, { text: `⏱️ Temps ecoule : ${duration.toFixed(2)} secondes.` });
    }, 10000); // S'arrete automatiquement apres 10s pour la demo
  }
};
