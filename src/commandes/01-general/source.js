'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'source',
  aliases: ['repo'],
  category: 'general',
  description: 'Code source du bot',
  async execute(sock, m, from) {
    const url = process.env.REPO_URL || 'https://github.com/Beaute-Gar/DJOUSSE-TECH-MD';
    await sock.sendMessage(from, { text: style.renderInfo([`Source : ${url}`]) });
  }
};