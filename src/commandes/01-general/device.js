'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'device',
  category: 'general',
  description: 'Infos sur l\'appareil',
  async execute(sock, m, from) {
    await sock.sendMessage(from, {
      text: style.renderInfo([
        `Plateforme   : ${process.platform}`,
        `Architecture : ${process.arch}`,
        `Node.js      : ${process.version}`
      ])
    });
  }
};