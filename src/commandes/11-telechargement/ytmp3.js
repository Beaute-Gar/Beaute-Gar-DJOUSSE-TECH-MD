'use strict';
const style = require('../../config/style');
const { ytAudio } = require('../../lib/yt-download');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'ytmp3',
  aliases: ['ytaudio'],
  category: 'telechargement',
  description: "Télécharge l'audio d'une vidéo YouTube",
  async execute(sock, m, from, args, ctx = {}) {
    const url = (args[0] || '').trim();
    if (!url || !/youtu\.?be/.test(url)) {
      return sock.sendMessage(from, { text: style.renderInfo(['Usage : .ytmp3 <lien YouTube>']) });
    }

    try {
      await sock.sendMessage(from, { text: style.renderInfo(['Extraction audio YouTube en cours...']) });
      const data = await ytAudio(url);
      if (!data || !data.buffer || !data.buffer.length) throw new Error('Audio introuvable');

      const safeName = String(data.title || 'youtube').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 60) || 'youtube';

      if (ctx && ctx.testSaveToDesktop) {
        const desktop = path.join(process.env.USERPROFILE || '', 'Desktop');
        const file = path.join(desktop, `ytmp3_${Date.now()}.${data.ext || 'mp3'}`);
        fs.writeFileSync(file, data.buffer);
        await sock.sendMessage(from, { text: `TEST_OK:${file}` });
        return file;
      }

      await sock.sendMessage(from, {
        audio: data.buffer,
        mimetype: data.mimetype || 'audio/mpeg',
        fileName: `${safeName}.${data.ext || 'mp3'}`,
        ptt: false
      }, { quoted: m });
    } catch (e) {
      console.error('[YTMP3 ERROR]', e && e.message);
      await sock.sendMessage(from, { text: style.renderError([`Erreur YTMP3 : ${e.message || 'Une erreur est survenue.'}`]) });
      if (ctx && ctx.testSaveToDesktop) throw e;
    }
  }
};
