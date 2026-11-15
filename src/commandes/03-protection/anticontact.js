'use strict';
const style = require('../../config/style');
const db = require('../../lib/database');
const { isGroup, getGroupMeta, isAdmin } = require('../../lib/helpers');

module.exports = {
  name: 'anticontact',
  category: 'protection',
  description: 'Active/desactive le blocage des cartes de visite (on/off)',
  async execute(sock, m, from, args) {
    if (!isGroup(from)) return sock.sendMessage(from, { text: style.renderError(['Reserve aux groupes.']) });
    const meta = await getGroupMeta(sock, from);
    if (!isAdmin(meta, m.key.participant || from)) return sock.sendMessage(from, { text: style.renderError(['Admin uniquement.']) });

    const toggle = (args[0] || '').toLowerCase();
    if (!['on', 'off'].includes(toggle)) {
      return sock.sendMessage(from, { text: style.renderInfo(['Usage : .anticontact on/off']) });
    }

    const settings = db.getSetting(`protection_${from}`, {});
    settings.anticontact = toggle === 'on';
    db.setSetting(`protection_${from}`, settings);

    await sock.sendMessage(from, {
      text: style.renderSuccess([`Anti-contact ${toggle === 'on' ? 'active' : 'desactive'}.`])
    });
  }
};
