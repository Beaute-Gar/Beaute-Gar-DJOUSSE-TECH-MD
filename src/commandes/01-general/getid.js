'use strict';
const style = require('../../config/style');
const { isGroup, getGroupMeta } = require('../../lib/helpers');
const { phoneOf, pretty } = require('../../lib/phone');

module.exports = {
  name: 'getid',
  aliases: ['id'],
  category: 'general',
  description: "Affiche les numéros (sans JID)",
  async execute(sock, m, from) {
    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const target = mentioned[0] || m.key.participant || from;
    let meta = null;
    if (isGroup(from)) { try { meta = await getGroupMeta(sock, from); } catch (e) {} }
    const chatNum = isGroup(from) ? 'Groupe' : pretty(phoneOf(sock, meta, from) || from);
    const targetNum = pretty(phoneOf(sock, meta, target) || target);
    await sock.sendMessage(from, {
      text: style.renderInfo([`Chat   : ${chatNum}`, `Cible  : ${targetNum}`])
    });
  }
};