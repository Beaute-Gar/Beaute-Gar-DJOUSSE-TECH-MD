'use strict';
const style = require('../../config/style');
const db = require('../../lib/database');

module.exports = {
  name: 'save',
  category: 'divers',
  description: 'Sauvegarde du texte dans une note',
  async execute(sock, m, from, args) {
    const text = args.join(' ');
    if (!text) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .save <texte>']) });

    const sender = m.key.participant || from;
    const notes = db.getSetting(`notes_${sender}`, []);
    notes.push({ text, time: Date.now() });
    db.setSetting(`notes_${sender}`, notes);

    await sock.sendMessage(from, { text: style.renderSuccess(['Note sauvegardee.']) });
  }
};
