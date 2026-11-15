'use strict';
const style  = require('../../config/style');
const config = require('../../config/config');
const { formatUptime } = require('../../lib/helpers');

module.exports = {
  name: 'uptime',
  category: 'general',
  description: 'Temps de fonctionnement',
  async execute(sock, m, from) {
    await sock.sendMessage(from, {
      text: style.renderInfo([`Uptime : ${formatUptime(Date.now() - config.startTime)}`])
    });
  }
};