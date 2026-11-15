'use strict';
const style = require('../../config/style');
const { fbDownload, downloadBuffer } = require('../../lib/media-download');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'facebook',
  aliases: ['fb'],
  category: 'telechargement',
  description: 'Télécharge une vidéo Facebook',
  async execute(sock, m, from, args, ctx = {}) {
    const url = args[0];
    if (!url || !/facebook\.com|fb\.watch/i.test(url)) {
      return sock.sendMessage(from, { text: style.renderInfo(['Usage : .facebook <lien Facebook>']) });
    }
    try {
      await sock.sendMessage(from, { text: style.renderInfo(['Téléchargement Facebook en cours...']) });
      const videoUrl = await fbDownload(url);
      if (ctx && ctx.testSaveToDesktop) {
        const desktop = path.join(process.env.USERPROFILE || '', 'Desktop');
        const file = path.join(desktop, `facebook_${Date.now()}.mp4`);
        fs.writeFileSync(file, await downloadBuffer(videoUrl));
        await sock.sendMessage(from, { text: `TEST_OK:${file}` });
        return file;
      }
      await sock.sendMessage(from, { video: { url: videoUrl }, caption: 'Facebook' });
    } catch (e) {
      console.error('[FACEBOOK ERROR]', e);
      await sock.sendMessage(from, { text: style.renderError([`Erreur Facebook : ${e.message}`]) });
      if (ctx && ctx.testSaveToDesktop) throw e;
    }
  }
};
