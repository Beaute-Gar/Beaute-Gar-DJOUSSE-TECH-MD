'use strict';
const style = require('../../config/style');
const config = require('../../config/config');
const { isOwner } = require('../../lib/auth');
const { snapshot, health } = require('../../core/supervisor');

const STATUS = {
  open: 'connecte',
  connecting: 'connexion',
  reconnecting: 'reconnexion',
  closed: 'arrete'
};

function duration(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}j ${h}h`;
  if (h) return `${h}h ${m}min`;
  return `${m}min`;
}

module.exports = {
  name: 'health',
  category: 'owner',
  description: 'Sante du bot (memoire, uptime, sessions)',
  async execute(sock, m, from) {
    if (!isOwner(sock, m, config, from)) {
      return sock.sendMessage(from, { text: style.renderError(['Reserve au proprietaire.']) });
    }

    const h = health();
    const open = h.sessions.filter((s) => s.status === 'open').length;

    await sock.sendMessage(from, {
      text: style.box('SANTE DU BOT', [
        `En ligne depuis : ${duration(h.uptimeMs)}`,
        `Memoire : ${h.rssMb} Mo (tas : ${h.heapMb} Mo)`,
        `Sessions connectees : ${open}/${snapshot().length}`
      ])
    });
  }
};
