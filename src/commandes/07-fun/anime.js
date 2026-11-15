'use strict';
const style = require('../../config/style');
const axios = require('axios');

const ENDPOINTS = ['neko', 'waifu', 'kitsune'];

module.exports = {
  name: 'anime',
  aliases: ['waifu', 'neko'],
  category: 'fun',
  description: 'Image anime aleatoire (SFW). Usage : .anime [type]',
  async execute(sock, m, from, args) {
    try {
      const type = (args && args[0] && ENDPOINTS.includes(args[0].toLowerCase())) ? args[0].toLowerCase() : ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
      const res = await axios.get(`https://nekos.best/api/v2/${type}`, { timeout: 15000 });
      const url = res.data && res.data.results && res.data.results[0] && res.data.results[0].url;
      if (!url) throw new Error('Pas d\'image.');
      await sock.sendMessage(from, { image: { url }, caption: `Anime : ${type}` }, { quoted: m });
    } catch (e) {
      console.error('[ANIME]', e.message);
      await sock.sendMessage(from, { text: style.renderError(['Erreur anime : ' + e.message]) }, { quoted: m });
    }
  }
};