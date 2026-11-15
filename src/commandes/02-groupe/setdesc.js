'use strict';
const style = require('../../config/style');
const { isGroup, getGroupMeta, isAdmin, isBotAdmin } = require('../../lib/helpers');

module.exports = {
  name: 'setdesc',
  category: 'groupe',
  description: 'Change la description du groupe',
  async execute(sock, m, from, args) {
    if (!isGroup(from)) return sock.sendMessage(from, { text: style.renderError(['Reserve aux groupes.']) });
    if (!args.length) return sock.sendMessage(from, { text: style.renderError(['Usage : .setdesc <texte>']) });
    const meta = await getGroupMeta(sock, from);
    if (!isAdmin(meta, m.key.participant)) return sock.sendMessage(from, { text: style.renderError(['Admin uniquement.']) });
    if (!isBotAdmin(meta, sock)) {
      return sock.sendMessage(from, { text: style.renderError(['Le bot doit etre admin.']) });
    }
    try {
      await sock.groupUpdateDescription(from, args.join(' '));
      await sock.sendMessage(from, { text: style.renderSuccess(['Description mise a jour.']) });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([e.message]) });
    }
  }
};