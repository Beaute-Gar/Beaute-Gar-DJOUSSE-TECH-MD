'use strict';
const style = require('../../config/style');
const { formatUptime } = require('../../lib/helpers');

module.exports = {
  name: 'runtime',
  category: 'general',
  description: 'Duree de vie du processus Node',
  async execute(sock, m, from) {
    await sock.sendMessage(from, {
      text: style.renderInfo([`Processus : ${formatUptime(process.uptime() * 1000)}`])
    });
  }
};