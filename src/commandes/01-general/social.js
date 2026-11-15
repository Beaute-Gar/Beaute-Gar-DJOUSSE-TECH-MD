'use strict';
const style = require('../../config/style');

const LINKS = {
  WhatsApp : 'https://whatsapp.com/channel/xxxx',
  GitHub   : 'https://github.com/Beaute-Gar/DJOUSSE-TECH-MD',
  YouTube  : 'https://youtube.com/@djousse-tech'
};

module.exports = {
  name: 'social',
  aliases: ['links'],
  category: 'general',
  description: 'Reseaux sociaux',
  async execute(sock, m, from) {
    const lines = Object.entries(LINKS).map(([k, v]) => `${k} : ${v}`);
    await sock.sendMessage(from, { text: style.renderInfo(lines) });
  }
};