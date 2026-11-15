'use strict';

const style = require('../../config/style');
const lg = require('../../jeux/loupgarou');

module.exports = {
  name: 'lg',
  aliases: ['loupgarou', 'loup-garou', 'loups', 'vote', 'voter'],
  category: 'jeux',
  description: 'Loup-Garou : jeu de roles en groupe',
  async execute(sock, m, from, args) {
    try {
      if (await lg.handleMessage(sock, m)) return;
    } catch (e) {
      console.error('[loupgarou] stub:', e.message);
    }
    await sock.sendMessage(from, {
      text: style.box('LOUP-GAROU', [
        'Utilisez :',
        '.lg',
        '.lg join',
        '.lg go',
        '.lg stop',
        '.lg status',
        '.lg roles',
        '.vote N'
      ])
    }, { quoted: m }).catch(() => {});
  }
};
