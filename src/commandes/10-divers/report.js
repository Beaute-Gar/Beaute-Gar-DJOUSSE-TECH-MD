'use strict';
const style = require('../../config/style');
const config = require('../../config/config');
const { isGroup, getGroupMeta } = require('../../lib/helpers');
const { getOwnerNumber, getBotNumber } = require('../../lib/auth');
const { phoneOf, pretty } = require('../../lib/phone');

module.exports = {
  name: 'report',
  category: 'divers',
  description: "Signale un bug ou un problème au propriétaire",
  async execute(sock, m, from, args) {
    const report = args.join(' ').trim();
    if (!report) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .report <problème>']) });

    const ownerNum = getOwnerNumber(config) || getBotNumber(sock);
    if (!ownerNum) {
      return sock.sendMessage(from, { text: style.renderError(['Aucun propriétaire configuré/détecté.']) });
    }

    const ownerJid = ownerNum + '@s.whatsapp.net';
    let meta = null; if (isGroup(from)) { try { meta = await getGroupMeta(sock, from); } catch (e) {} }
    const senderJid = m.key.participant || from;
    const senderLabel = pretty(phoneOf(sock, meta, senderJid) || senderJid);
    try {
      await sock.sendMessage(ownerJid, { text: `RAPPORT DE ${senderLabel} :\n\n${report}` });
      await sock.sendMessage(from, { text: style.renderSuccess(['Rapport envoyé au propriétaire. Merci !']) });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError(['Impossible d\'envoyer le rapport.']) });
    }
  }
};
