'use strict';

const style = require('../../config/style');
const nuit = require('../../groupe/modenuit');

module.exports = {
  name: 'modenuit',
  aliases: ['nightmode', 'nuit'],
  category: 'jeux',
  description: 'Mode nuit : ferme/rouvre le groupe a une heure fixe',
  async execute(sock, m, from, args) {
    try {
      if (await nuit.handleMessage(sock, m)) return;
    } catch (e) {
      console.error('[modenuit] stub:', e.message);
    }
    await sock.sendMessage(from, {
      text: style.box('MODE NUIT', [
        'Utilisez :',
        '.modenuit 22:00 06:00 [fuseau]',
        '.modenuit off',
        '.modenuit on',
        '.modenuit'
      ])
    }, { quoted: m }).catch(() => {});
  }
};
