'use strict';
const style = require('../../config/style');
const autostatus = require('../../lib/autostatus');
const store = require('../../lib/numstore');

module.exports = {
  name: 'statut',
  aliases: ['status', 'autostatus', 'autostatut'],
  category: 'general',
  description: 'Active/desactive la lecture et la reaction automatiques aux statuts. Usage : .statut on | .statut off',
  async execute(sock, m, from, args) {
    try {
      if (!store.isOwner(sock, m)) {
        return sock.sendMessage(from, { text: style.renderError(['Commande reservee au proprietaire du bot.']) }, { quoted: m });
      }

      const arg = (args && args[0]) ? String(args[0]).toLowerCase() : '';
      const cfg = autostatus.load();

      if (arg === 'on') {
        cfg.view = true;
        cfg.react = true;
        autostatus.save(cfg);
        return sock.sendMessage(from, { text: style.renderSuccess(['Statut auto : ACTIVE (lecture + reaction).']) }, { quoted: m });
      }
      if (arg === 'off') {
        cfg.view = false;
        cfg.react = false;
        autostatus.save(cfg);
        return sock.sendMessage(from, { text: style.renderSuccess(['Statut auto : DESACTIVE (plus de like auto).']) }, { quoted: m });
      }

      // Affichage de l'etat
      const lines = [
        'Statut auto : ' + (cfg.view || cfg.react ? 'ON' : 'OFF'),
        'Lecture : ' + (cfg.view ? 'ON' : 'OFF'),
        'Reaction : ' + (cfg.react ? 'ON' : 'OFF'),
        '',
        'Usage : .statut on | .statut off'
      ];
      return sock.sendMessage(from, { text: style.renderInfo(lines) }, { quoted: m });
    } catch (e) {
      console.error('[STATUT]', e.message);
      await sock.sendMessage(from, { text: style.renderError(['Erreur : ' + e.message]) }, { quoted: m });
    }
  }
};