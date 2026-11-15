'use strict';
const style = require('../../config/style');
const { isGroup, getGroupMeta, getTarget } = require('../../lib/helpers');
const { phoneOf } = require('../../lib/phone');

module.exports = {
  name: 'numero',
  aliases: ['num', 'whois'],
  category: 'protection',
  description: 'Affiche le numero de telephone d\'un membre (mention ou reponse)',
  async execute(sock, m, from) {
    const meta = isGroup(from) ? await getGroupMeta(sock, from) : null;
    const self = m.key.participant || from;

    let target = getTarget(m);
    if (!target || target === from) target = self;

    const alts = target === self
      ? [m.key.participantPn, m.key.participantAlt, m.key.senderPn, m.key.remoteJidAlt].filter(Boolean)
      : [];
    const phone = phoneOf(sock, meta, target, ...alts);

    if (!phone) {
      return sock.sendMessage(from, {
        text: style.renderError(['Numero masque par WhatsApp pour ce membre (identifiant anonyme).'])
      });
    }
    await sock.sendMessage(from, {
      text: style.renderSuccess([`Numero : +${phone}`, `Lien : wa.me/${phone}`])
    });
  }
};
