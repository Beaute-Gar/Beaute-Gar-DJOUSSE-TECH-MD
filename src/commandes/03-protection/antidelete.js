'use strict';
const style = require('../../config/style');
const db = require('../../lib/database');
const { isGroup, getGroupMeta, isAdmin } = require('../../lib/helpers');

module.exports = {
  name: 'antidelete',
  aliases: ['antidel', 'antisupp'],
  category: 'protection',
  description: 'Restitue les messages supprimes ou modifies avec le numero de l\'auteur',
  async execute(sock, m, from, args) {
    if (isGroup(from) && !m.key.fromMe) {
      const meta = await getGroupMeta(sock, from);
      if (!isAdmin(meta, m.key.participant)) return sock.sendMessage(from, { text: style.renderError(['Admin uniquement.']) });
    }

    const key = `antidelete_${from}`;
    const arg = (args[0] || '').toLowerCase();

    if (arg !== 'on' && arg !== 'off') {
      const state = db.getSetting(key, true) ? 'ON' : 'OFF';
      return sock.sendMessage(from, { text: style.renderInfo([`Antidelete : ${state}`, 'Usage : .antidelete on | off']) });
    }

    db.setSetting(key, arg === 'on');
    await sock.sendMessage(from, {
      text: style.renderSuccess([
        arg === 'on'
          ? 'Antidelete active : les messages supprimes ou modifies seront restitues.'
          : 'Antidelete desactive.'
      ])
    });
  }
};