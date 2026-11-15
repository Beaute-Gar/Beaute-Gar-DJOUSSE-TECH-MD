'use strict';
const style = require('../../config/style');
const { isGroup, getGroupMeta, isAdmin } = require('../../lib/helpers');

module.exports = {
  name: 'link',
  aliases: ['gclink'],
  category: 'groupe',
  description: 'Obtient le lien du groupe',
  async execute(sock, m, from) {
    if (!isGroup(from)) return sock.sendMessage(from, { text: style.renderError(['Reserve aux groupes.']) });
    const meta = await getGroupMeta(sock, from);
    if (!isAdmin(meta, m.key.participant)) return sock.sendMessage(from, { text: style.renderError(['Admin uniquement.']) });
    try {
      const code = await sock.groupInviteCode(from);
      await sock.sendMessage(from, { text: style.renderInfo([`Lien : https://chat.whatsapp.com/${code}`]) });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([e.message]) });
    }
  }
};