'use strict';
const style = require('../../config/style');
const { isGroup, getGroupMeta } = require('../../lib/helpers');

module.exports = {
  name: 'hidetag',
  aliases: ['htag'],
  category: 'groupe',
  description: 'Mention invisible de tous les membres',
  async execute(sock, m, from, args) {
    if (!isGroup(from)) return sock.sendMessage(from, { text: style.renderError(['Reserve aux groupes.']) });
    const meta = await getGroupMeta(sock, from);
    const mentions = meta.participants.map(p => p.id);
    const text = args.join(' ') || style.renderInfo(['Annonce silencieuse']);
    await sock.sendMessage(from, { text, mentions });
  }
};