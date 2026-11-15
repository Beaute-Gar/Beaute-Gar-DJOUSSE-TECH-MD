'use strict';
const style = require('../../config/style');
const db = require('../../lib/database');

module.exports = {
  name: 'afk',
  category: 'divers',
  description: 'Active le mode AFK (Away From Keyboard)',
  async execute(sock, m, from, args) {
    const reason = args.join(' ') || 'Aucune raison specifiee';
    const afkList = db.getSetting('afk', {});
    afkList[m.key.participant || from] = { reason, time: Date.now() };
    db.setSetting('afk', afkList);
    
    await sock.sendMessage(from, { text: style.renderInfo([`Mode AFK active : ${reason}`]) });
  }
};
