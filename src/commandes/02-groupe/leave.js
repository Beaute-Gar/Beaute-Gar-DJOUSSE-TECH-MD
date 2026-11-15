'use strict';
const style = require('../../config/style');
const { isGroup, getGroupMeta, isAdmin } = require('../../lib/helpers');

module.exports = {
  name: 'leave',
  aliases: ['quitter'],
  category: 'groupe',
  description: 'Fait quitter le bot du groupe',
  async execute(sock, m, from) {
    if (!isGroup(from)) return sock.sendMessage(from, { text: style.renderError(['Reserve aux groupes.']) });
    const meta = await getGroupMeta(sock, from);
    if (!isAdmin(meta, m.key.participant)) return sock.sendMessage(from, { text: style.renderError(['Admin uniquement.']) });
    await sock.sendMessage(from, { text: style.renderInfo(['Au revoir !']) });
    setTimeout(() => sock.groupLeave(from), 1500);
  }
};