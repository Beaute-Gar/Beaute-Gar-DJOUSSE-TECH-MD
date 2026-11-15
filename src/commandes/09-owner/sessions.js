'use strict';
const style = require('../../config/style');
const config = require('../../config/config');
const { isOwner } = require('../../lib/auth');
const { snapshot } = require('../../core/supervisor');

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
  name: 'sessions',
  category: 'owner',
  description: 'Liste les sessions et leur etat',
  async execute(sock, m, from) {
    if (!isOwner(sock, m, config, from)) {
      return sock.sendMessage(from, { text: style.renderError(['Reserve au proprietaire.']) });
    }

    const rows = snapshot();
    if (!rows.length) {
      return sock.sendMessage(from, { text: style.renderInfo(['Aucune session enregistree.']) });
    }

    const lines = rows.map((r) => {
      const state = STATUS[r.status] || r.status;
      const reason = r.reason ? ` [${r.reason}]` : '';
      return `${r.id} : ${state} (${duration(Date.now() - r.since)})${reason}`;
    });

    await sock.sendMessage(from, {
      text: style.box(`SESSIONS (${rows.length})`, lines)
    });
  }
};
