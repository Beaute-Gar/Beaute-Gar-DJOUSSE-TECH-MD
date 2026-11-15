'use strict';
const style = require('../../config/style');
const { soundcloudDownload, downloadBuffer } = require('../../lib/media-download');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'soundcloud',
  aliases: ['sc'],
  category: 'telechargement',
  description: 'Télécharge depuis SoundCloud',
  async execute(sock, m, from, args, ctx = {}) {
    const url = args[0];
    if (!url || !/soundcloud\.com/i.test(url)) {
      return sock.sendMessage(from, { text: style.renderInfo(['Usage : .soundcloud <lien SoundCloud>']) });
    }
    try {
      await sock.sendMessage(from, { text: style.renderInfo(['Téléchargement SoundCloud en cours...']) });
      const data = await soundcloudDownload(url);
      if (!data || !data.audio) throw new Error('Audio introuvable');
      if (ctx && ctx.testSaveToDesktop) {
        const desktop = path.join(process.env.USERPROFILE || '', 'Desktop');
        const file = path.join(desktop, `soundcloud_${Date.now()}.mp3`);
        fs.writeFileSync(file, await downloadBuffer(data.audio));
        await sock.sendMessage(from, { text: `TEST_OK:${file}` });
        return file;
      }
      await sock.sendMessage(from, { audio: { url: data.audio }, mimetype: 'audio/mp4', fileName: `${(data.title||'soundcloud').replace(/[^a-zA-Z0-9]/g,'_')}.mp3` }, { quoted: m });
    } catch (e) {
      console.error('[SOUNDCLOUD ERROR]', e);
      await sock.sendMessage(from, { text: style.renderError([`Erreur SoundCloud : ${e.message}`]) });
      if (ctx && ctx.testSaveToDesktop) throw e;
    }
  }
};
