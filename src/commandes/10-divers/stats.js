'use strict';
const style = require('../../config/style');
const config = require('../../config/config');
const { formatUptime } = require('../../lib/helpers');

module.exports = {
  name: 'stats',
  category: 'divers',
  description: 'Affiche les statistiques du bot',
  async execute(sock, m, from) {
    const mem = process.memoryUsage();
    await sock.sendMessage(from, { 
      text: style.box('STATS', [
        `Uptime : ${formatUptime(Date.now() - config.startTime)}`,
        `RAM : ${(mem.rss / 1024 / 1024).toFixed(1)} Mo`,
        `Plateforme : ${process.platform}`
      ]) 
    });
  }
};
