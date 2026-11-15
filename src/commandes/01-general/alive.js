'use strict';
const style  = require('../../config/style');
const config = require('../../config/config');
const { formatUptime } = require('../../lib/helpers');

module.exports = {
  name: 'alive',
  category: 'general',
  description: 'Verifie que le bot est en ligne',
  async execute(sock, m, from) {
    await sock.sendMessage(from, {
      text: style.renderSuccess([
        `${config.botName} est en ligne !`,
        `Uptime : ${formatUptime(Date.now() - config.startTime)}`
      ])
    });
  }
};