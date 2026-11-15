'use strict';
const style = require('../../config/style');
const db = require('../../lib/database');

module.exports = {
  name: 'note',
  category: 'divers',
  description: 'Affiche ou supprime des notes',
  async execute(sock, m, from, args) {
    const sender = m.key.participant || from;
    const notes = db.getSetting(`notes_${sender}`, []);

    if (args[0] === 'clear') {
      db.setSetting(`notes_${sender}`, []);
      return sock.sendMessage(from, { text: style.renderSuccess(['Toutes les notes ont ete supprimees.']) });
    }

    if (notes.length === 0) return sock.sendMessage(from, { text: style.renderInfo(['Aucune note.']) });

    const list = notes.map((n, i) => `${i + 1}. ${n.text}`).join('\n');
    await sock.sendMessage(from, { text: style.box('NOTES', [list]) });
  }
};
