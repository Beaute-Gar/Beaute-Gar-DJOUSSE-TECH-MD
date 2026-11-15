'use strict';
const style = require('../../config/style');
const { mediafireDownload, downloadBuffer } = require('../../lib/media-download');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'mediafire',
  aliases: ['mf'],
  category: 'telechargement',
  description: 'Télécharge un fichier MediaFire',
  async execute(sock, m, from, args, ctx = {}) {
    const url = args[0];
    if (!url || !/mediafire\.com/i.test(url)) {
      return sock.sendMessage(from, { text: style.renderInfo(['Usage : .mediafire <lien MediaFire>']) });
    }
    try {
      await sock.sendMessage(from, { text: style.renderInfo(['Récupération MediaFire...']) });
      const data = await mediafireDownload(url);
      if (ctx && ctx.testSaveToDesktop) {
        const desktop = path.join(process.env.USERPROFILE || '', 'Desktop');
        const name = (data.filename || 'mediafire').replace(/[^a-zA-Z0-9._-]/g, '_');
        const file = path.join(desktop, `${name}_${Date.now()}`);
        fs.writeFileSync(file, await downloadBuffer(data.url));
        await sock.sendMessage(from, { text: `TEST_OK:${file}` });
        return file;
      }
      await sock.sendMessage(from, { document: { url: data.url }, fileName: data.filename || 'mediafire_file', mimetype: 'application/octet-stream' }, { quoted: m });
    } catch (e) {
      console.error('[MEDIAFIRE ERROR]', e);
      await sock.sendMessage(from, { text: style.renderError([`Erreur MediaFire : ${e.message}`]) });
      if (ctx && ctx.testSaveToDesktop) throw e;
    }
  }
};
