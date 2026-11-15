'use strict';
const style = require('../../config/style');
const { isGroup, getGroupMeta, getTarget } = require('../../lib/helpers');
const { phoneOf, pretty } = require('../../lib/phone');

module.exports = {
  name: 'getjid',
  aliases: ['jid', 'numero-cible'],
  category: 'groupe',
  description: "Affiche le numéro d'un membre (sans JID)",
  async execute(sock, m, from) {
    const target = getTarget(m);
    let meta = null;
    if (isGroup(from)) { try { meta = await getGroupMeta(sock, from); } catch (e) {} }
    await sock.sendMessage(from, { text: style.renderInfo([`Numéro : ${pretty(phoneOf(sock, meta, target) || target)}`]) });
  }
};