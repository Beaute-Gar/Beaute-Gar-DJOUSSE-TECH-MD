'use strict';
const style = require('../../config/style');
const config = require('../../config/config');
const { exec } = require('child_process');

module.exports = {
  name: 'exec',
  aliases: ['shell'],
  category: 'owner',
  description: 'Execute une commande systeme (danger)',
  async execute(sock, m, from, args) {
    if (!require('../../lib/auth').isOwner(sock, m, config, from)) {
      return sock.sendMessage(from, { text: style.renderError(['Reserve au proprietaire.']) });
    }
    const cmd = args.join(' ');
    if (!cmd) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .exec <commande>']) });

    exec(cmd, (error, stdout, stderr) => {
      if (error) return sock.sendMessage(from, { text: style.renderError([error.message]) });
      const output = stdout || stderr || 'Aucune sortie.';
      sock.sendMessage(from, { text: style.renderInfo([output.slice(0, 1000)]) });
    });
  }
};
