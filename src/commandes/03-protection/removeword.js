'use strict';
const style = require('../../config/style');
const db = require('../../lib/database');
const { isGroup, getGroupMeta, isAdmin } = require('../../lib/helpers');

module.exports = {
  name: 'removeword',
  category: 'protection',
  description: 'Retire un mot de la liste interdite',
  async execute(sock, m, from, args) {
    if (!isGroup(from)) return sock.sendMessage(from, { text: style.renderError(['Reserve aux groupes.']) });
    const meta = await getGroupMeta(sock, from);
    if (!isAdmin(meta, m.key.participant)) return sock.sendMessage(from, { text: style.renderError(['Admin uniquement.']) });

    const word = args.join(' ').trim().toLowerCase();
    if (!word) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .removeword <mot>']) });

    const badWords = db.getSetting(`badwords_${from}`, []);
    const index = badWords.indexOf(word);
    if (index === -1) {
      return sock.sendMessage(from, { text: style.renderError(['Mot introuvable dans la liste.']) });
    }

    badWords.splice(index, 1);
    db.setSetting(`badwords_${from}`, badWords);

    await sock.sendMessage(from, { text: style.renderSuccess([`Mot retire : ${word}`]) });
  }
};
