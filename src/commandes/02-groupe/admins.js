'use strict';
const style = require('../../config/style');
const { isGroup, getGroupMeta } = require('../../lib/helpers');
const { phoneOf, pretty } = require('../../lib/phone');

module.exports = {
  name: 'admins',
  category: 'groupe',
  description: 'Liste les admins du groupe',
  async execute(sock, m, from) {
    if (!isGroup(from)) return sock.sendMessage(from, { text: style.renderError(['Réservé aux groupes.']) });
    const meta = await getGroupMeta(sock, from);
    if (!meta || !Array.isArray(meta.participants)) return sock.sendMessage(from, { text: style.renderError(['Impossible de récupérer les membres.']) });
    const admins = meta.participants.filter(p => p.admin);
    const lines = admins.map(p => `• ${pretty(phoneOf(sock, meta, p.id, p.phoneNumber, p.pn, p.lid) || p.id)}${p.admin === 'superadmin' ? ' (super)' : ''}`);
    const text = [style.listHeader('ADMINS'), ...lines, `• Total : ${admins.length}`, style.frameFooter()].join('\n');
    await sock.sendMessage(from, { text, mentions: admins.map(p => p.id).filter(Boolean) });
  }
};
