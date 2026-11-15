'use strict';
const style = require('../../config/style');
const axios = require('axios');

module.exports = {
  name: 'ssweb',
  aliases: ['screenshot', 'capture', 'ss'],
  category: 'outils',
  description: 'Capture d\'ecran d\'un site web. Usage : .ssweb <url>',
  async execute(sock, m, from, args) {
    try {
      const url = (args && args[0]) ? args.join(' ').trim() : '';
      if (!url || !/^https?:\/\//i.test(url)) {
        return sock.sendMessage(from, { text: style.renderInfo(['Usage : .ssweb <url>', 'Ex : .ssweb https://google.com']) }, { quoted: m });
      }

      await sock.sendMessage(from, { react: { text: 'ðŸ“¸', key: m.key } });

      const apiUrl = 'https://image.thum.io/get/width/1280/' + url;
      const res = await axios.get(apiUrl, {
        timeout: 30000,
        responseType: 'arraybuffer',
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      const buf = Buffer.from(res.data);
      if (!buf || buf.length < 100) throw new Error('Capture vide.');

      await sock.sendMessage(from, {
        image: buf,
        caption: 'Capture de : ' + url
      }, { quoted: m });
    } catch (e) {
      console.error('[SSWEB]', e.message);
      await sock.sendMessage(from, { text: style.renderError(['Erreur capture : ' + e.message]) }, { quoted: m });
    }
  }
};