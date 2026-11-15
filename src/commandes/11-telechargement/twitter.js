'use strict';
const style = require('../../config/style');
const { twitterDownload, downloadBuffer } = require('../../lib/media-download');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'twitter',
  aliases: ['x'],
  category: 'telechargement',
  description: 'Télécharge un média Twitter/X',
  async execute(sock, m, from, args, ctx = {}) {
    const url = args[0];
    if (!url || !/(twitter\.com|x\.com)\//i.test(url)) {
      return sock.sendMessage(from, { text: style.renderInfo(['Usage : .twitter <lien Twitter/X>']) });
    }
    try {
      await sock.sendMessage(from, { text: style.renderInfo(['Téléchargement Twitter/X en cours...']) });
      const data = await twitterDownload(url);
      const mediaUrl = (data && data.url) || data;
      if (!mediaUrl) throw new Error('Média introuvable');
      const isImage = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(mediaUrl);
      if (ctx && ctx.testSaveToDesktop) {
        const desktop = path.join(process.env.USERPROFILE || '', 'Desktop');
        const ext = isImage ? 'jpg' : 'mp4';
        const file = path.join(desktop, `twitter_${Date.now()}.${ext}`);
        fs.writeFileSync(file, await downloadBuffer(mediaUrl));
        await sock.sendMessage(from, { text: `TEST_OK:${file}` });
        return file;
      }
      if (isImage) await sock.sendMessage(from, { image: { url: mediaUrl }, caption: 'Twitter/X' });
      else await sock.sendMessage(from, { video: { url: mediaUrl }, caption: 'Twitter/X' });
    } catch (e) {
      console.error('[TWITTER ERROR]', e);
      await sock.sendMessage(from, { text: style.renderError([`Erreur Twitter : ${e.message}`]) });
      if (ctx && ctx.testSaveToDesktop) throw e;
    }
  }
};
