'use strict';
const style = require('../../config/style');
const { isGroup, getGroupMeta, isAdmin, isBotAdmin, getTarget } = require('../../lib/helpers');
const { phoneOf, pretty } = require('../../lib/phone');

module.exports = {
  name: 'promote',
  category: 'groupe',
  description: 'Promeut un membre admin',
  async execute(sock, m, from) {
    if (!isGroup(from)) return sock.sendMessage(from, { text: style.renderError(['Réservé aux groupes.']) });
    const meta = await getGroupMeta(sock, from);
    if (!meta) return sock.sendMessage(from, { text: style.renderError(['Impossible de récupérer le groupe.']) });
    if (!isAdmin(meta, m.key.participant || from)) return sock.sendMessage(from, { text: style.renderError(['Admin uniquement.']) });
    if (!isBotAdmin(meta, sock)) return sock.sendMessage(from, { text: style.renderError(['Le bot doit être admin.']) });
    const target = getTarget(m);
    if (!target || target === from) return sock.sendMessage(from, { text: style.renderError(['Cible invalide.']) });
    try {
      await sock.groupParticipantsUpdate(from, [target], 'promote');
      await sock.sendMessage(from, { text: style.renderSuccess([`${pretty(phoneOf(sock, meta, target) || target)} est maintenant admin.`]), mentions: [target] });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([e.message]) });
    }
  }
};
