'use strict';
const style = require('../../config/style');
const db = require('../../lib/database');
const { isGroup, getGroupMeta, isAdmin } = require('../../lib/helpers');

module.exports = {
  name: 'addword',
  category: 'protection',
  description: 'Ajoute un mot a la liste interdite',
  async execute(sock, m, from, args) {
    if (!isGroup(from)) return sock.sendMessage(from, { text: style.renderError(['Reserve aux groupes.']) });
    const meta = await getGroupMeta(sock, from);
    if (!isAdmin(meta, m.key.participant)) return sock.sendMessage(from, { text: style.renderError(['Admin uniquement.']) });

    const word = args.join(' ').trim();
    if (!word) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .addword <mot>']) });

    const badWords = db.getSetting(`badwords_${from}`, []);
    if (badWords.includes(word.toLowerCase())) {
      return sock.sendMessage(from, { text: style.renderInfo(['Ce mot est deja dans la liste.']) });
    }

    badWords.push(word.toLowerCase());
    db.setSetting(`badwords_${from}`, badWords);

    await sock.sendMessage(from, { text: style.renderSuccess([`Mot ajoute : ${word}`]) });
  }
};
