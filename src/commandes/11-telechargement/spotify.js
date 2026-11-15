'use strict';
const style = require('../../config/style');
const { spotifyDownload, downloadBuffer } = require('../../lib/media-download');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'spotify',
  category: 'telechargement',
  description: 'Télécharge une piste Spotify (lien ou recherche)',
  async execute(sock, m, from, args, ctx = {}) {
    const query = args.join(' ').trim();
    if (!query) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .spotify <lien Spotify ou titre>']) });
    try {
      await sock.sendMessage(from, { text: style.renderInfo(['Recherche/téléchargement Spotify en cours...']) });
      const data = await spotifyDownload(query);
      if (!data || !data.audio) throw new Error('Audio introuvable');
      if (ctx && ctx.testSaveToDesktop) {
        const desktop = path.join(process.env.USERPROFILE || '', 'Desktop');
        const file = path.join(desktop, `spotify_${Date.now()}.mp3`);
        fs.writeFileSync(file, await downloadBuffer(data.audio));
        await sock.sendMessage(from, { text: `TEST_OK:${file}` });
        return file;
      }
      if (data.thumbnail) await sock.sendMessage(from, { image: { url: data.thumbnail }, caption: `🎵 ${data.title || query}` });
      await sock.sendMessage(from, { audio: { url: data.audio }, mimetype: 'audio/mp4', fileName: `${(data.title||'spotify').replace(/[^a-zA-Z0-9]/g,'_')}.mp3` }, { quoted: m });
    } catch (e) {
      console.error('[SPOTIFY ERROR]', e);
      await sock.sendMessage(from, { text: style.renderError([`Erreur Spotify : ${e.message}`]) });
      if (ctx && ctx.testSaveToDesktop) throw e;
    }
  }
};
