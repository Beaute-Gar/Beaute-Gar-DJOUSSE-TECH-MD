'use strict';
const style = require('../../config/style');
const axios = require('axios');

module.exports = {
  name: 'shorten',
  aliases: ['short', 'raccourcir', 'tiny'],
  category: 'outils',
  description: 'Raccourcit une URL. Usage : .shorten <url>',
  async execute(sock, m, from, args) {
    try {
      const url = (args && args[0]) ? args.join(' ').trim() : '';
      if (!url || !/^https?:\/\//i.test(url)) {
        return sock.sendMessage(from, { text: style.renderInfo(['Usage : .shorten <url>']) }, { quoted: m });
      }
      const res = await axios.get('https://is.gd/create.php', {
        params: { format: 'simple', url }, timeout: 15000
      });
      const short = (typeof res.data === 'string' ? res.data : '').trim();
      if (!short || !short.startsWith('http')) throw new Error('Reponse invalide.');
      await sock.sendMessage(from, { text: style.renderSuccess([`URL raccourcie : ${short}`]) }, { quoted: m });
    } catch (e) {
      console.error('[SHORTEN]', e.message);
      await sock.sendMessage(from, { text: style.renderError(['Erreur : ' + e.message]) }, { quoted: m });
    }
  }
};