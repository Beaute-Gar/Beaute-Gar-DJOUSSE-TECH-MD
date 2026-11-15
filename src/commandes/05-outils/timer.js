'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'timer',
  aliases: ['minuteur'],
  category: 'outils',
  description: 'Programme un rappel (ex: .timer 5m)',
  async execute(sock, m, from, args) {
    const timeStr = args[0];
    if (!timeStr) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .timer <temps> (ex: 5m, 30s, 1h)']) });

    const match = String(timeStr).match(/^(\d+)([smh])$/i);
    if (!match) return sock.sendMessage(from, { text: style.renderError(['Format invalide (ex: 5m, 30s, 1h)']) });

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    let ms = 0;
    if (unit === 's') ms = value * 1000;
    if (unit === 'm') ms = value * 60 * 1000;
    if (unit === 'h') ms = value * 60 * 60 * 1000;
    if (ms <= 0) return sock.sendMessage(from, { text: style.renderError(['Durée invalide.']) });

    await sock.sendMessage(from, { text: style.renderSuccess([`Minuteur programmé pour ${value}${unit}.`]) });

    setTimeout(async () => {
      try {
        const who = m.key.participant || m.key.remoteJid || from;
        const tag = String(who).split('@')[0].split(':')[0];
        await sock.sendMessage(from, { text: `⏰ @${tag}, ton minuteur est terminé !`, mentions: [who] });
      } catch (e) {
        try { await sock.sendMessage(from, { text: '⏰ Minuteur terminé !' }); } catch (_) {}
      }
    }, ms);
  }
};
