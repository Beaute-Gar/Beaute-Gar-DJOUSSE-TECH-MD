'use strict';
const style = require('../../config/style');
const db = require('../../lib/database');
const { isGroup, getGroupMeta, isAdmin } = require('../../lib/helpers');

module.exports = {
  name: 'warnlimit',
  category: 'protection',
  description: 'Definit la limite d\'avertissements avant expulsion',
  async execute(sock, m, from, args) {
    if (!isGroup(from)) return sock.sendMessage(from, { text: style.renderError(['Reserve aux groupes.']) });
    const meta = await getGroupMeta(sock, from);
    if (!isAdmin(meta, m.key.participant)) return sock.sendMessage(from, { text: style.renderError(['Admin uniquement.']) });

    if (!args[0]) {
      const current = db.getSetting(`warnlimit_${from}`, 3);
      return sock.sendMessage(from, { text: style.renderInfo([`La limite actuelle est de ${current} avertissements.`]) });
    }

    const limit = parseInt(args[0]);
    if (isNaN(limit) || limit < 1) {
      return sock.sendMessage(from, { text: style.renderError(['Veuillez entrer un nombre valide.']) });
    }

    db.setSetting(`warnlimit_${from}`, limit);
    await sock.sendMessage(from, { text: style.renderSuccess([`Limite d'avertissements fixee a ${limit}.`]) });
  }
};
