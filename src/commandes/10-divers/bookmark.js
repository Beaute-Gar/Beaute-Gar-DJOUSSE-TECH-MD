'use strict';
const style = require('../../config/style');
const db = require('../../lib/database');

module.exports = {
  name: 'bookmark',
  category: 'divers',
  description: 'Sauvegarde un message (repondre au message)',
  async execute(sock, m, from) {
    const quoted = m.message?.extendedTextMessage?.contextInfo;
    if (!quoted || !quoted.quotedMessage) {
      return sock.sendMessage(from, { text: style.renderError(['Repondez a un message pour le sauvegarder.']) });
    }

    const text = quoted.quotedMessage.conversation || 
                 quoted.quotedMessage.extendedTextMessage?.text || 
                 '[Media]';
                 
    const sender = m.key.participant || from;
    const bookmarks = db.getSetting(`bookmarks_${sender}`, []);
    bookmarks.push({ text, from: quoted.participant, time: Date.now() });
    db.setSetting(`bookmarks_${sender}`, bookmarks);

    await sock.sendMessage(from, { text: style.renderSuccess(['Message sauvegarde.']) });
  }
};
