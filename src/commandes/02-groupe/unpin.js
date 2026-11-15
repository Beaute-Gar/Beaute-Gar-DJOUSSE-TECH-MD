'use strict';
const style = require('../../config/style');
const { isGroup, getGroupMeta, isAdmin, isBotAdmin } = require('../../lib/helpers');

module.exports = {
  name: 'unpin',
  category: 'groupe',
  description: 'Desepingle le message courant',
  async execute(sock, m, from) {
    if (!isGroup(from)) return sock.sendMessage(from, { text: style.renderError(['Reserve aux groupes.']) });
    const meta = await getGroupMeta(sock, from);
    if (!isAdmin(meta, m.key.participant)) return sock.sendMessage(from, { text: style.renderError(['Admin uniquement.']) });
    if (!isBotAdmin(meta, sock)) {
      return sock.sendMessage(from, { text: style.renderError(['Le bot doit etre admin.']) });
    }
    try {
      await sock.sendMessage(from, { pin: { type: 2, time: 0, message: { key: { id: m.key.id, remoteJid: from, fromMe: false } } } });
      await sock.sendMessage(from, { text: style.renderSuccess(['Message desepingle.']) });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([e.message]) });
    }
  }
};