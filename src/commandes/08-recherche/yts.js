'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'yts',
  aliases: ['ytsearch'],
  category: 'recherche',
  description: 'Recherche des vidéos YouTube',
  async execute(sock, m, from, args) {
    const query = args.join(' ').trim();
    if (!query) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .yts <recherche>']) });
    try {
      const { yts } = require('btch-downloader');
      const data = await yts(query);
      let list = [];
      if (data && data.result && Array.isArray(data.result.all)) list = data.result.all.filter(x => x && x.type === 'video');
      else if (data && Array.isArray(data.videos)) list = data.videos;
      else if (data && Array.isArray(data.result)) list = data.result;
      if (!list.length) throw new Error('Aucun résultat');
      const results = list.slice(0, 5).map((item, i) => {
        const url = item.url || (item.videoId ? `https://youtube.com/watch?v=${item.videoId}` : '');
        return `${i + 1}. ${item.title || 'Sans titre'}\n   ${url}`;
      });
      await sock.sendMessage(from, { text: style.box('YOUTUBE', results) });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([`Impossible de rechercher sur YouTube : ${e.message}`]) });
    }
  }
};
