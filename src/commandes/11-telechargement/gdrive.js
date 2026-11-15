'use strict';
const style = require('../../config/style');
const { gdriveDownload, downloadBuffer } = require('../../lib/media-download');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'gdrive',
  category: 'telechargement',
  description: 'Télécharge un fichier Google Drive',
  async execute(sock, m, from, args, ctx = {}) {
    const url = args[0];
    if (!url || !/drive\.google\.com/i.test(url)) {
      return sock.sendMessage(from, { text: style.renderInfo(['Usage : .gdrive <lien Google Drive>']) });
    }
    try {
      await sock.sendMessage(from, { text: style.renderInfo(['Récupération Google Drive...']) });
      const data = await gdriveDownload(url);
      if (ctx && ctx.testSaveToDesktop) {
        const desktop = path.join(process.env.USERPROFILE || '', 'Desktop');
        const name = (data.filename || 'gdrive').replace(/[^a-zA-Z0-9._-]/g, '_');
        const file = path.join(desktop, `${name}_${Date.now()}`);
        fs.writeFileSync(file, await downloadBuffer(data.url));
        await sock.sendMessage(from, { text: `TEST_OK:${file}` });
        return file;
      }
      await sock.sendMessage(from, { document: { url: data.url }, fileName: data.filename || 'gdrive_file', mimetype: 'application/octet-stream' }, { quoted: m });
    } catch (e) {
      console.error('[GDRIVE ERROR]', e);
      await sock.sendMessage(from, { text: style.renderError([`Erreur GDrive : ${e.message}`]) });
      if (ctx && ctx.testSaveToDesktop) throw e;
    }
  }
};
