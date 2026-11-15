'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'wallpaper',
  category: 'sticker-media',
  description: "Récupère un fond d'écran aléatoire",
  async execute(sock, m, from, args) {
    const query = args.join(' ').trim() || 'nature';
    try {
      const url = `https://picsum.photos/1080/1920?random=${Date.now()}`;
      await sock.sendMessage(from, { image: { url }, caption: `Fond d'écran : ${query}` });
    } catch (e) {
      try {
        const url = `https://loremflickr.com/1080/1920/${encodeURIComponent(query)}?lock=${Date.now() % 10000}`;
        await sock.sendMessage(from, { image: { url }, caption: `Fond d'écran : ${query}` });
      } catch (err) {
        await sock.sendMessage(from, { text: style.renderError(['Impossible de récupérer un fond d\'écran.']) });
      }
    }
  }
};
