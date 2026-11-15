'use strict';
const style = require('../../config/style');
const { ytAudio } = require('../../lib/yt-download');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'play',
  aliases: ['song', 'musique'],
  category: 'telechargement',
  description: 'Recherche et télécharge de la musique (YouTube)',
  async execute(sock, m, from, args, ctx = {}) {
    const query = args.join(' ').trim();
    if (!query) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .play <titre>']) });

    try {
      await sock.sendMessage(from, { text: style.renderInfo(['Recherche et téléchargement de la musique en cours...']) });
      const data = await ytAudio(query);
      if (!data || !data.buffer || !data.buffer.length) throw new Error('Musique introuvable');

      const safeName = String(data.title || query).replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 60) || 'musique';

      if (ctx && ctx.testSaveToDesktop) {
        const desktop = path.join(process.env.USERPROFILE || '', 'Desktop');
        const file = path.join(desktop, `play_${Date.now()}.${data.ext || 'mp3'}`);
        fs.writeFileSync(file, data.buffer);
        await sock.sendMessage(from, { text: `TEST_OK:${file}` });
        return file;
      }

      if (data.thumbnail) {
        try {
          await sock.sendMessage(from, { image: { url: data.thumbnail }, caption: `🎵 ${data.title || query}` });
        } catch (e) {}
      }

      await sock.sendMessage(from, {
        audio: data.buffer,
        mimetype: data.mimetype || 'audio/mpeg',
        fileName: `${safeName}.${data.ext || 'mp3'}`,
        ptt: false
      }, { quoted: m });
    } catch (e) {
      console.error('[PLAY ERROR]', e && e.message);
      await sock.sendMessage(from, { text: style.renderError([`Erreur Play : ${e.message || 'Une erreur est survenue.'}`]) });
      if (ctx && ctx.testSaveToDesktop) throw e;
    }
  }
};
