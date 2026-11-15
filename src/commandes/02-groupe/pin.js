'use strict';
const style = require('../../config/style');
const { isGroup, getGroupMeta, isAdmin, isBotAdmin, getQuoted } = require('../../lib/helpers');

module.exports = {
  name: 'pin',
  category: 'groupe',
  description: 'Epingle un message (repondre au message)',
  async execute(sock, m, from) {
    if (!isGroup(from)) return sock.sendMessage(from, { text: style.renderError(['Reserve aux groupes.']) });
    const meta = await getGroupMeta(sock, from);
    if (!isAdmin(meta, m.key.participant)) return sock.sendMessage(from, { text: style.renderError(['Admin uniquement.']) });
    if (!isBotAdmin(meta, sock)) {
      return sock.sendMessage(from, { text: style.renderError(['Le bot doit etre admin.']) });
    }
    const ctx = m.message.extendedTextMessage?.contextInfo;
    if (!ctx?.stanzaId) {
      return sock.sendMessage(from, { text: style.renderError(['Repondez au message a epingler.']) });
    }
    try {
      await sock.sendMessage(from, {
        pin: { type: 1, time: 86400, message: { key: { id: ctx.stanzaId, remoteJid: from, fromMe: false, participant: ctx.participant } } }
      });
      await sock.sendMessage(from, { text: style.renderSuccess(['Message epingle pour 24h.']) });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([e.message]) });
    }
  }
};