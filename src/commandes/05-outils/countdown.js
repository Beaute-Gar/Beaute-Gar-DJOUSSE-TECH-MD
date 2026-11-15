'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'countdown',
  category: 'outils',
  description: 'Compte à rebours (ex: .countdown 10)',
  async execute(sock, m, from, args) {
    const seconds = parseInt(args[0], 10);
    if (isNaN(seconds) || seconds < 1 || seconds > 60) {
      return sock.sendMessage(from, { text: style.renderInfo(['Usage : .countdown <secondes entre 1 et 60>']) });
    }

    await sock.sendMessage(from, { text: `Compte à rebours de ${seconds} secondes lancé !` });
    let remaining = seconds;
    const interval = setInterval(async () => {
      try {
        if (remaining <= 0) {
          clearInterval(interval);
          await sock.sendMessage(from, { text: '⏰ Temps écoulé !' });
          return;
        }
        if (remaining <= 3) await sock.sendMessage(from, { text: `${remaining}...` });
      } catch (e) {}
      remaining--;
    }, 1000);
  }
};
