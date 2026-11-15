'use strict';

const style = require('../../config/style');
const av = require('../../jeux/actionverite');

module.exports = {
  name: 'actionverite',
  aliases: ['start', 'startgame', 'jouer', 'stop', 'stopgame', 'dare', 'defi', 'défi', 'truth'],
  category: 'jeux',
  description: 'Action ou Vérité : jeu de groupe',
  async execute(sock, m, from, args) {
    try {
      if (await av.handleMessage(sock, m)) return;
    } catch (e) {
      console.error('[actionverite] stub:', e.message);
    }
    await sock.sendMessage(from, {
      text: style.box('ACTION OU VÉRITÉ', [
        'Utilisez :',
        '.start game [soft|hot|extreme]',
        '.jouer',
        '.stop game',
        '.dare [niveau]',
        '.truth [niveau]'
      ])
    }, { quoted: m }).catch(() => {});
  }
};
