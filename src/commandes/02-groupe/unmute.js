'use strict';
const style = require('../../config/style');
const { isGroup, getGroupMeta, isAdmin, isBotAdmin } = require('../../lib/helpers');

module.exports = {
  name: 'unmute',
  category: 'groupe',
  description: 'Retablit la parole dans le groupe',
  async execute(sock, m, from) {
    if (!isGroup(from)) return sock.sendMessage(from, { text: style.renderError(['Reserve aux groupes.']) });
    const meta = await getGroupMeta(sock, from);
    if (!isAdmin(meta, m.key.participant)) return sock.sendMessage(from, { text: style.renderError(['Admin uniquement.']) });
    if (!isBotAdmin(meta, sock)) {
      return sock.sendMessage(from, { text: style.renderError(['Le bot doit etre admin.']) });
    }
    try {
      await sock.groupSettingUpdate(from, 'not_announcement');
      await sock.sendMessage(from, { text: style.renderSuccess(['Groupe ouvert.']) });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([e.message]) });
    }
  }
};