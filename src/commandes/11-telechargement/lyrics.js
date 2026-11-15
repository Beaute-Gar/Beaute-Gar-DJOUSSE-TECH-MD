'use strict';
const style = require('../../config/style');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'lyrics',
  aliases: ['paroles'],
  category: 'telechargement',
  description: "Recherche les paroles d'une chanson",
  async execute(sock, m, from, args, ctx = {}) {
    const query = args.join(' ').trim();
    if (!query) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .lyrics <titre de la chanson>']) });
    try {
      await sock.sendMessage(from, { text: style.renderInfo(['Recherche des paroles...']) });
      const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      const item = Array.isArray(data) ? data.find(x => x.plainLyrics || x.syncedLyrics) : null;
      const lyrics = item && (item.plainLyrics || item.syncedLyrics);
      if (!lyrics) throw new Error('Paroles introuvables');
      const title = [item.trackName || item.name, item.artistName].filter(Boolean).join(' - ') || query;
      const text = `🎵 ${title}\n\n${lyrics}`;

      if (ctx && ctx.testSaveToDesktop) {
        const desktop = path.join(process.env.USERPROFILE || '', 'Desktop');
        const file = path.join(desktop, `lyrics_${Date.now()}.txt`);
        fs.writeFileSync(file, text, 'utf8');
        await sock.sendMessage(from, { text: `TEST_OK:${file}` });
        return file;
      }

      await sock.sendMessage(from, { text: text.slice(0, 12000) }, { quoted: m });
    } catch (e) {
      console.error('[LYRICS ERROR]', e);
      await sock.sendMessage(from, { text: style.renderError([`Erreur Lyrics : ${e.message}`]) });
      if (ctx && ctx.testSaveToDesktop) throw e;
    }
  }
};
