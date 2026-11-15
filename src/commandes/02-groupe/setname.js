'use strict';
const style = require('../../config/style');
const { isGroup, getGroupMeta, isAdmin, isBotAdmin } = require('../../lib/helpers');

module.exports = {
  name: 'setname',
  category: 'groupe',
  description: 'Change le nom du groupe',
  async execute(sock, m, from, args) {
    if (!isGroup(from)) return sock.sendMessage(from, { text: style.renderError(['Reserve aux groupes.']) });
    if (!args.length) return sock.sendMessage(from, { text: style.renderError(['Usage : .setname <nom>']) });
    const meta = await getGroupMeta(sock, from);
    if (!isAdmin(meta, m.key.participant)) return sock.sendMessage(from, { text: style.renderError(['Admin uniquement.']) });
    if (!isBotAdmin(meta, sock)) {
      return sock.sendMessage(from, { text: style.renderError(['Le bot doit etre admin.']) });
    }
    try {
      await sock.groupUpdateSubject(from, args.join(' '));
      await sock.sendMessage(from, { text: style.renderSuccess(['Nom du groupe mis a jour.']) });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([e.message]) });
    }
  }
};