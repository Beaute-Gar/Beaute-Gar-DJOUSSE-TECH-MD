'use strict';
const style = require('../../config/style');
const { tiktokDownload, downloadBuffer } = require('../../lib/media-download');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'tiktok',
  aliases: ['tt'],
  category: 'telechargement',
  description: 'Télécharge une vidéo TikTok (sans filigrane)',
  async execute(sock, m, from, args, ctx = {}) {
    const url = args[0];
    if (!url || (!url.includes('tiktok.com') && !url.includes('vt.tiktok.com'))) {
      return sock.sendMessage(from, { text: style.renderInfo(['Usage : .tiktok <lien TikTok>']) });
    }

    try {
      await sock.sendMessage(from, { text: style.renderInfo(['Téléchargement TikTok en cours...']) });
      const data = await tiktokDownload(url);
      if (!data || !data.video) throw new Error('Vidéo TikTok introuvable');

      if (ctx && ctx.testSaveToDesktop) {
        const desktop = path.join(process.env.USERPROFILE || '', 'Desktop');
        const file = path.join(desktop, `tiktok_${Date.now()}.mp4`);
        fs.writeFileSync(file, await downloadBuffer(data.video));
        await sock.sendMessage(from, { text: `TEST_OK:${file}` });
        return file;
      }

      await sock.sendMessage(from, {
        video: { url: data.video },
        mimetype: 'video/mp4',
        caption: `🎵 TikTok : ${data.title || 'Vidéo'}`
      });
    } catch (e) {
      console.error('[TIKTOK ERROR]', e);
      await sock.sendMessage(from, { text: style.renderError([`Erreur TikTok : ${e.message || 'Une erreur est survenue.'}`]) });
      if (ctx && ctx.testSaveToDesktop) throw e;
    }
  }
};
