'use strict';
const style      = require('../../config/style');
const config     = require('../../config/config');
const { formatUptime } = require('../../lib/helpers');
const cmdHandler = require('../../handlers/command-handler');

module.exports = {
  name: 'info',
  category: 'general',
  description: 'Informations du bot',
  async execute(sock, m, from) {
    const mem = process.memoryUsage();
    await sock.sendMessage(from, {
      text: style.box(config.botName + ' | INFO', [
        `Nom       : ${config.botName}`,
        `Version   : ${config.version}`,
        `Node.js   : ${process.version}`,
        `Plateforme: ${process.platform}`,
        `Uptime    : ${formatUptime(Date.now() - config.startTime)}`,
        `RAM       : ${(mem.rss / 1024 / 1024).toFixed(1)} Mo`,
        `Commandes : ${cmdHandler.commands.size}`,
        `Prefixe   : ${config.prefix}`,
        `Proprio   : ${config.ownerName}`,
        `Date      : ${style.nowDate()}`
      ])
    });
  }
};