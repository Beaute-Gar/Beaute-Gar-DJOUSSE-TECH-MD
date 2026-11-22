'use strict';
const style = require('../../config/style');
const { isGroup, getGroupMeta } = require('../../lib/helpers');
const { phoneOf, pretty } = require('../../lib/phone');

module.exports = {
  name: 'members',
  category: 'groupe',
  description: 'Liste les membres du groupe',
  async execute(sock, m, from) {
    if (!isGroup(from)) return sock.sendMessage(from, { text: style.renderError(['Réservé aux groupes.']) });
    const meta = await getGroupMeta(sock, from);
    if (!meta || !Array.isArray(meta.participants)) return sock.sendMessage(from, { text: style.renderError(['Impossible de récupérer les membres.']) });
    const nonAdmins = meta.participants.filter(p => !p.admin);
    const shown = nonAdmins.slice(0, 40);
    const lines = shown.map(p => `• ${pretty(phoneOf(sock, meta, p.id, p.phoneNumber, p.pn, p.lid) || p.id)}`);
    const text = [style.frameHeader('MEMBRES'), ...lines, `• Total : ${nonAdmins.length} membre(s)`, style.frameFooter()].join('\n');
    await sock.sendMessage(from, { text, mentions: shown.map(p => p.id).filter(Boolean) });
  }
};
