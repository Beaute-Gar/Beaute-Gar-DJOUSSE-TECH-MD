'use strict';
const style = require('../../config/style');
const { isGroup, getGroupMeta, isAdmin, isBotAdmin } = require('../../lib/helpers');

module.exports = {
  name: 'revoke',
  category: 'groupe',
  description: 'Reinitialise le lien du groupe',
  async execute(sock, m, from) {
    if (!isGroup(from)) return sock.sendMessage(from, { text: style.renderError(['Reserve aux groupes.']) });
    const meta = await getGroupMeta(sock, from);
    if (!isAdmin(meta, m.key.participant)) return sock.sendMessage(from, { text: style.renderError(['Admin uniquement.']) });
    if (!isBotAdmin(meta, sock)) {
      return sock.sendMessage(from, { text: style.renderError(['Le bot doit etre admin.']) });
    }
    try {
      const code = await sock.groupRevokeInvite(from);
      await sock.sendMessage(from, { text: style.renderSuccess([`Nouveau lien : https://chat.whatsapp.com/${code}`]) });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([e.message]) });
    }
  }
};