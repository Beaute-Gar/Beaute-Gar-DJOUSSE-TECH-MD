'use strict';
const style = require('../../config/style');
const db = require('../../lib/database');
const { isGroup, getGroupMeta, isAdmin } = require('../../lib/helpers');

module.exports = {
  name: 'antiflood',
  category: 'protection',
  description: 'Active/desactive l\'anti-flood',
  async execute(sock, m, from, args) {
    if (!isGroup(from)) return sock.sendMessage(from, { text: style.renderError(['Reserve aux groupes.']) });
    const meta = await getGroupMeta(sock, from);
    if (!isAdmin(meta, m.key.participant)) return sock.sendMessage(from, { text: style.renderError(['Admin uniquement.']) });

    const toggle = args[0]?.toLowerCase();
    if (!['on', 'off'].includes(toggle)) {
      return sock.sendMessage(from, { text: style.renderInfo(['Usage : .antiflood on/off']) });
    }

    const settings = db.getSetting(`protection_${from}`, {});
    settings.antiflood = toggle === 'on';
    db.setSetting(`protection_${from}`, settings);

    await sock.sendMessage(from, { text: style.renderSuccess([`Anti-flood ${toggle === 'on' ? 'active' : 'desactive'}.`]) });
  }
};
