'use strict';
const style = require('../../config/style');
const { isSunoUrl, sunoAudio } = require('../../lib/suno-download');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'suno',
  aliases: ['sunoai', 'sunodl'],
  category: 'telechargement',
  description: 'Télécharge une musique depuis un lien Suno',
  async execute(sock, m, from, args, ctx = {}) {
    const url = (args[0] || '').trim();
    if (!url || !isSunoUrl(url)) {
      return sock.sendMessage(from, { text: style.renderInfo(['Usage : .suno <lien Suno>', 'Exemples : .suno https://suno.com/s/5mRA3iccIBRCfV08']) });
    }

    try {
      await sock.sendMessage(from, { text: style.renderInfo(['Téléchargement Suno en cours...']) });
      const data = await sunoAudio(url);
      if (!data || !data.buffer || !data.buffer.length) throw new Error('Audio introuvable');

      const safeName = String(data.title || 'suno').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 60) || 'suno';

      if (ctx && ctx.testSaveToDesktop) {
        const desktop = path.join(process.env.USERPROFILE || '', 'Desktop');
        const file = path.join(desktop, `suno_${Date.now()}.${data.ext || 'mp3'}`);
        fs.writeFileSync(file, data.buffer);
        await sock.sendMessage(from, { text: `TEST_OK:${file}` });
        return file;
      }

      if (data.thumbnail) {
        try {
          await sock.sendMessage(from, { image: { url: data.thumbnail }, caption: `🎵 ${data.title || 'Suno'}` });
        } catch (e) {}
      }

      await sock.sendMessage(from, {
        audio: data.buffer,
        mimetype: data.mimetype || 'audio/mpeg',
        fileName: `${safeName}.${data.ext || 'mp3'}`,
        ptt: false
      }, { quoted: m });
    } catch (e) {
      console.error('[SUNO ERROR]', e && e.message);
      await sock.sendMessage(from, { text: style.renderError([`Erreur Suno : ${e.message || 'Une erreur est survenue.'}`]) });
      if (ctx && ctx.testSaveToDesktop) throw e;
    }
  }
};
