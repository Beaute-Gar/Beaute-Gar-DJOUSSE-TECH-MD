'use strict';
const style = require('../../config/style');
const { downloadBuffer } = require('../../lib/media-download');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'gitclone',
  category: 'telechargement',
  description: 'Télécharge un dépôt GitHub en ZIP',
  async execute(sock, m, from, args, ctx = {}) {
    let repoUrl = args[0];
    if (!repoUrl || !repoUrl.includes('github.com')) {
      return sock.sendMessage(from, { text: style.renderInfo(['Usage : .gitclone <lien du repo GitHub>']) });
    }
    try {
      await sock.sendMessage(from, { text: style.renderInfo(['Préparation du téléchargement du dépôt...']) });
      repoUrl = repoUrl.replace(/\/$|\.git$/g, '');
      const parts = repoUrl.split('/');
      if (parts.length < 5) throw new Error('Lien GitHub invalide.');
      const user = parts[parts.length - 2];
      const repo = parts[parts.length - 1];
      const zipUrl = `https://api.github.com/repos/${user}/${repo}/zipball`;

      if (ctx && ctx.testSaveToDesktop) {
        const desktop = path.join(process.env.USERPROFILE || '', 'Desktop');
        const file = path.join(desktop, `${repo}_${Date.now()}.zip`);
        fs.writeFileSync(file, await downloadBuffer(zipUrl));
        await sock.sendMessage(from, { text: `TEST_OK:${file}` });
        return file;
      }

      await sock.sendMessage(from, {
        document: { url: zipUrl },
        fileName: `${repo}.zip`,
        mimetype: 'application/zip',
        caption: `Dépôt GitHub ${user}/${repo}`
      }, { quoted: m });
    } catch (e) {
      console.error('[GITCLONE ERROR]', e);
      await sock.sendMessage(from, { text: style.renderError([`Erreur GitClone : ${e.message}`]) });
      if (ctx && ctx.testSaveToDesktop) throw e;
    }
  }
};
