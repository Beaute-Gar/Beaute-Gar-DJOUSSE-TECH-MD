'use strict';
const style = require('../../config/style');
const { ytVideo } = require('../../lib/yt-download');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'ytmp4',
  aliases: ['ytvideo'],
  category: 'telechargement',
  description: 'Télécharge une vidéo YouTube',
  async execute(sock, m, from, args, ctx = {}) {
    const url = (args[0] || '').trim();
    if (!url || !/youtu\.?be/.test(url)) {
      return sock.sendMessage(from, { text: style.renderInfo(['Usage : .ytmp4 <lien YouTube>']) });
    }

    try {
      await sock.sendMessage(from, { text: style.renderInfo(['Téléchargement YouTube (vidéo) en cours...']) });
      const data = await ytVideo(url);
      if (!data || !data.buffer || !data.buffer.length) throw new Error('Vidéo introuvable');

      const safeName = String(data.title || 'youtube').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 60) || 'youtube';

      if (ctx && ctx.testSaveToDesktop) {
        const desktop = path.join(process.env.USERPROFILE || '', 'Desktop');
        const file = path.join(desktop, `ytmp4_${Date.now()}.${data.ext || 'mp4'}`);
        fs.writeFileSync(file, data.buffer);
        await sock.sendMessage(from, { text: `TEST_OK:${file}` });
        return file;
      }

      await sock.sendMessage(from, {
        video: data.buffer,
        mimetype: data.mimetype || 'video/mp4',
        fileName: `${safeName}.${data.ext || 'mp4'}`,
        caption: `🎬 YouTube : ${data.title || 'Vidéo'}`
      }, { quoted: m });
    } catch (e) {
      console.error('[YTMP4 ERROR]', e && e.message);
      await sock.sendMessage(from, { text: style.renderError([`Erreur YTMP4 : ${e.message || 'Une erreur est survenue.'}`]) });
      if (ctx && ctx.testSaveToDesktop) throw e;
    }
  }
};
