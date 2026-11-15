'use strict';
const style = require('../../config/style');
const { downloadBuffer } = require('../../lib/media-download');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'apk',
  category: 'telechargement',
  description: 'Recherche et télécharge une application APK (Aptoide)',
  async execute(sock, m, from, args, ctx = {}) {
    const query = args.join(' ').trim();
    if (!query) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .apk <nom de l\'application>']) });
    try {
      await sock.sendMessage(from, { text: style.renderInfo(['Recherche APK en cours...']) });
      const res = await fetch(`https://ws75.aptoide.com/api/7/apps/search/query=${encodeURIComponent(query)}/limit=1`);
      const data = await res.json();
      const app = data && data.datalist && data.datalist.list && data.datalist.list[0];
      const dl = app && app.file && app.file.path;
      if (!app || !dl) throw new Error('Application introuvable');
      const name = app.name || query;
      const fileName = `${String(name).replace(/[^a-zA-Z0-9._-]/g, '_')}.apk`;

      if (ctx && ctx.testSaveToDesktop) {
        const desktop = path.join(process.env.USERPROFILE || '', 'Desktop');
        const file = path.join(desktop, `apk_${Date.now()}_${fileName}`);
        fs.writeFileSync(file, await downloadBuffer(dl));
        await sock.sendMessage(from, { text: `TEST_OK:${file}` });
        return file;
      }

      await sock.sendMessage(from, { text: style.renderInfo([`Téléchargement de ${name}...`]) });
      await sock.sendMessage(from, { document: { url: dl }, fileName, mimetype: 'application/vnd.android.package-archive' }, { quoted: m });
    } catch (e) {
      console.error('[APK ERROR]', e);
      await sock.sendMessage(from, { text: style.renderError([`Erreur APK : ${e.message}`]) });
      if (ctx && ctx.testSaveToDesktop) throw e;
    }
  }
};
