'use strict';
const style = require('../../config/style');
const paths = require('../../config/paths');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'backup',
  category: 'divers',
  description: 'Envoie une sauvegarde de la base de donnees',
  async execute(sock, m, from) {
    // Verification proprietaire simplifiee
    if (!m.key.fromMe) return sock.sendMessage(from, { text: style.renderError(['Reserve au proprietaire.']) });

    try {
      // Le dossier central est le meme sur PC et sur Android (BOT_DATA_DIR).
      // Il peut ne pas encore exister au premier lancement : on le cree.
      const dbPath = paths.database;
      fs.mkdirSync(dbPath, { recursive: true });
      const files = fs.readdirSync(dbPath).filter(f => f.endsWith('.json'));

      if (!files.length) {
        return sock.sendMessage(from, { text: style.renderInfo(['Aucune sauvegarde disponible.']) });
      }

      for (const file of files) {
        const buffer = fs.readFileSync(path.join(dbPath, file));
        await sock.sendMessage(from, {
          document: buffer,
          fileName: `backup_${file}`,
          mimetype: 'application/json'
        });
      }
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError(['Erreur de sauvegarde.']) });
    }
  }
};
