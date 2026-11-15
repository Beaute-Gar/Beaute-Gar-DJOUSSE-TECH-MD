'use strict';
const style = require('../../config/style');
const db = require('../../lib/database');
const { isGroup, getGroupMeta, isAdmin, getTarget } = require('../../lib/helpers');
const { phoneOf, pretty } = require('../../lib/phone');

module.exports = {
  name: 'resetwarn',
  category: 'protection',
  description: "Réinitialise les avertissements d'un membre",
  async execute(sock, m, from) {
    if (!isGroup(from)) return sock.sendMessage(from, { text: style.renderError(['Réservé aux groupes.']) });
    const meta = await getGroupMeta(sock, from);
    if (!meta) return sock.sendMessage(from, { text: style.renderError(['Impossible de récupérer le groupe.']) });
    if (!isAdmin(meta, m.key.participant || from)) return sock.sendMessage(from, { text: style.renderError(['Admin uniquement.']) });

    const target = getTarget(m);
    if (!target || target === from) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .resetwarn @membre']) });
    const warns = db.getSetting(`warns_${from}`, {});
    delete warns[target];
    db.setSetting(`warns_${from}`, warns);
    const label = pretty(phoneOf(sock, meta, target) || target);
    await sock.sendMessage(from, {
      text: style.renderSuccess([`Avertissements réinitialisés pour ${label}.`]),
      mentions: [target]
    });
  }
};
