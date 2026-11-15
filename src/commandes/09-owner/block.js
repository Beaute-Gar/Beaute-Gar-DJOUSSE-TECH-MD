'use strict';
const style = require('../../config/style');
const config = require('../../config/config');
const { getTarget, isGroup, getGroupMeta } = require('../../lib/helpers');
const { phoneOf, pretty } = require('../../lib/phone');

module.exports = {
  name: 'block',
  category: 'owner',
  description: 'Bloque un contact',
  async execute(sock, m, from) {
    if (!require('../../lib/auth').isOwner(sock, m, config, from)) {
      return sock.sendMessage(from, { text: style.renderError(['Réservé au propriétaire.']) });
    }
    const target = getTarget(m);
    if (!target || target === from) return sock.sendMessage(from, { text: style.renderError(['Cible invalide.']) });
    try {
      await sock.updateBlockStatus(target, 'block');
      let meta = null; if (isGroup(from)) { try { meta = await getGroupMeta(sock, from); } catch (e) {} }
      await sock.sendMessage(from, { text: style.renderSuccess([`Contact bloqué : ${pretty(phoneOf(sock, meta, target) || target)}`]) });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([e.message]) });
    }
  }
};
