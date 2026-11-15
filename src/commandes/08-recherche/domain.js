'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'domain',
  aliases: ['whois'],
  category: 'recherche',
  description: "Affiche des informations RDAP sur un nom de domaine",
  async execute(sock, m, from, args) {
    const domain = (args[0] || '').trim().toLowerCase();
    if (!domain) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .domain <domaine.com>']) });
    try {
      const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, { headers: { accept: 'application/rdap+json, application/json' } });
      if (!res.ok) throw new Error(`RDAP HTTP ${res.status}`);
      const data = await res.json();
      const status = Array.isArray(data.status) ? data.status.slice(0, 5).join(', ') : 'inconnu';
      const events = Array.isArray(data.events) ? data.events : [];
      const getEvent = (action) => (events.find(e => e.eventAction === action) || {}).eventDate || 'inconnu';
      const ns = Array.isArray(data.nameservers) ? data.nameservers.map(n => n.ldhName).filter(Boolean).slice(0, 4) : [];
      await sock.sendMessage(from, {
        text: style.box('DOMAINE (RDAP)', [
          `Domaine : ${data.ldhName || domain}`,
          `Statut : ${status}`,
          `Enregistrement : ${getEvent('registration')}`,
          `Expiration : ${getEvent('expiration')}`,
          `Dernière modif : ${getEvent('last changed')}`,
          `Serveurs DNS : ${ns.length ? ns.join(', ') : 'inconnu'}`
        ])
      });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([`Impossible d'obtenir les infos du domaine : ${e.message}`]) });
    }
  }
};
