'use strict';
const style = require('../../config/style');
const { igDownload, downloadBuffer } = require('../../lib/media-download');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'instagram',
  aliases: ['ig'],
  category: 'telechargement',
  description: 'Télécharge un média Instagram',
  async execute(sock, m, from, args, ctx = {}) {
    const url = args[0];
    if (!url || (!url.includes('instagram.com') && !url.includes('instagr.am'))) {
      return sock.sendMessage(from, { text: style.renderInfo(['Usage : .instagram <lien Instagram>']) });
    }
    try {
      await sock.sendMessage(from, { text: style.renderInfo(['Téléchargement Instagram en cours...']) });
      const urls = await igDownload(url);
      const mediaUrl = urls[0];
      if (!mediaUrl) throw new Error('Média introuvable');
      const isVideo = /\.mp4|\/reel\/|\/tv\//i.test(mediaUrl + url);

      if (ctx && ctx.testSaveToDesktop) {
        const desktop = path.join(process.env.USERPROFILE || '', 'Desktop');
        const ext = isVideo ? 'mp4' : 'jpg';
        const file = path.join(desktop, `instagram_${Date.now()}.${ext}`);
        fs.writeFileSync(file, await downloadBuffer(mediaUrl));
        await sock.sendMessage(from, { text: `TEST_OK:${file}` });
        return file;
      }

      if (isVideo) await sock.sendMessage(from, { video: { url: mediaUrl }, caption: 'Instagram' });
      else await sock.sendMessage(from, { image: { url: mediaUrl }, caption: 'Instagram' });
    } catch (e) {
      console.error('[INSTAGRAM ERROR]', e);
      await sock.sendMessage(from, { text: style.renderError([`Erreur Instagram : ${e.message}`]) });
      if (ctx && ctx.testSaveToDesktop) throw e;
    }
  }
};
