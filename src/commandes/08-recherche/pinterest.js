'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'pinterest',
  category: 'recherche',
  description: 'Recherche une image Pinterest',
  async execute(sock, m, from, args) {
    const query = args.join(' ').trim();
    if (!query) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .pinterest <recherche>']) });
    try {
      // Essai via btch-downloader (recherche/lien selon support)
      try {
        const { pinterest } = require('btch-downloader');
        const r = await pinterest(query);
        const items = Array.isArray(r) ? r : (r && (r.result || r.data || r.images || r.url)) || [];
        const arr = Array.isArray(items) ? items : [items];
        const urls = arr.map(x => typeof x === 'string' ? x : (x && (x.image || x.url || x.src || x.link))).filter(Boolean);
        if (urls.length) {
          const pick = urls[Math.floor(Math.random() * Math.min(urls.length, 10))];
          return sock.sendMessage(from, { image: { url: pick }, caption: `Résultat Pinterest : ${query}` });
        }
      } catch (e) {}

      // Fallback: image depuis source publique (sans clé Pinterest officielle)
      const fallback = `https://image.pollinations.ai/prompt/${encodeURIComponent('pinterest style photo ' + query)}?width=1024&height=1024&nologo=true&seed=${Date.now()}`;
      await sock.sendMessage(from, { image: { url: fallback }, caption: `Résultat visuel pour : ${query}` });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([`Impossible de récupérer une image Pinterest : ${e.message}`]) });
    }
  }
};
