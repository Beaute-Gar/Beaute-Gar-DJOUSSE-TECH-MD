'use strict';
const style = require('../../config/style');
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
      const dbPath = path.join(__dirname, '../../storage/database');
      const files = fs.readdirSync(dbPath).filter(f => f.endsWith('.json'));
      
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
