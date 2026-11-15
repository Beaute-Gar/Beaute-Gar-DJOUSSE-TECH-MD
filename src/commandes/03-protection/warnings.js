'use strict';
const style = require('../../config/style');
const db = require('../../lib/database');
const { isGroup, getGroupMeta, getTarget } = require('../../lib/helpers');
const { phoneOf, pretty } = require('../../lib/phone');

module.exports = {
  name: 'warnings',
  category: 'protection',
  description: "Affiche les avertissements d'un membre",
  async execute(sock, m, from) {
    if (!isGroup(from)) return sock.sendMessage(from, { text: style.renderError(['Réservé aux groupes.']) });
    const target = getTarget(m);
    if (!target || target === from) {
      return sock.sendMessage(from, { text: style.renderInfo(['Usage : .warnings @membre (ou répondre à son message)']) });
    }
    let meta = null; try { meta = await getGroupMeta(sock, from); } catch (e) {}
    const warns = db.getSetting(`warns_${from}`, {});
    const count = warns[target] || 0;
    const limit = db.getSetting(`warnlimit_${from}`, 3);
    const label = pretty(phoneOf(sock, meta, target) || target);
    await sock.sendMessage(from, {
      text: style.renderInfo([`${label} a ${count}/${limit} avertissement(s).`]),
      mentions: [target]
    });
  }
};
