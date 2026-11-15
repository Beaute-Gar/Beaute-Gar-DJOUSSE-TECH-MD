'use strict';
const style = require('../../config/style');
const db = require('../../lib/database');
const { isGroup, getGroupMeta, isAdmin, getTarget } = require('../../lib/helpers');
const { phoneOf, pretty } = require('../../lib/phone');

module.exports = {
  name: 'whitelist',
  category: 'protection',
  description: 'Retire un membre de la blacklist',
  async execute(sock, m, from) {
    if (!isGroup(from)) return sock.sendMessage(from, { text: style.renderError(['Réservé aux groupes.']) });
    const meta = await getGroupMeta(sock, from);
    if (!meta) return sock.sendMessage(from, { text: style.renderError(['Impossible de récupérer le groupe.']) });
    if (!isAdmin(meta, m.key.participant || from)) return sock.sendMessage(from, { text: style.renderError(['Admin uniquement.']) });

    const target = getTarget(m);
    if (!target || target === from) {
      return sock.sendMessage(from, { text: style.renderInfo(['Usage : .whitelist @membre (ou répondre à son message)']) });
    }

    const list = db.getSetting(`blacklist_${from}`, []);
    const index = list.indexOf(target);
    const label = pretty(phoneOf(sock, meta, target) || target);
    if (index === -1) {
      return sock.sendMessage(from, { text: style.renderError([`${label} n'est pas dans la blacklist.`]), mentions: [target] });
    }

    list.splice(index, 1);
    db.setSetting(`blacklist_${from}`, list);

    await sock.sendMessage(from, {
      text: style.renderSuccess([`${label} retiré de la blacklist.`]),
      mentions: [target]
    });
  }
};
