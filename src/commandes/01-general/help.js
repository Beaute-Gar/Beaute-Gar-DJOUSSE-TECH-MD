'use strict';
const style      = require('../../config/style');
const config     = require('../../config/config');
const cmdHandler = require('../../handlers/command-handler');

module.exports = {
  name: 'helpx',
  category: 'general',
  description: 'Aide detaillee sur une commande',
  async execute(sock, m, from, args) {
    if (!args.length) {
      await sock.sendMessage(from, {
        text: style.renderInfo([`Usage : ${config.prefix}help <commande>`])
      });
      return;
    }
    const cmd = cmdHandler.find(args[0]);
    if (!cmd) {
      await sock.sendMessage(from, {
        text: style.renderError([`Commande inconnue : ${args[0]}`])
      });
      return;
    }
    await sock.sendMessage(from, {
      text: style.box(`${cmd.name.toUpperCase()} | AIDE`, [
        `Nom        : ${cmd.name}`,
        `Alias      : ${(cmd.aliases || []).join(', ') || 'aucun'}`,
        `Categorie  : ${cmd.category}`,
        `Description: ${cmd.description || 'N/A'}`,
        `Usage      : ${config.prefix}${cmd.name}`
      ])
    });
  }
};