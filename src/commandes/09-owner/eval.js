'use strict';
const style = require('../../config/style');
const config = require('../../config/config');
const { inspect } = require('util');

module.exports = {
  name: 'eval',
  category: 'owner',
  description: 'Evalue du code JavaScript (danger)',
  async execute(sock, m, from, args) {
    if (!require('../../lib/auth').isOwner(sock, m, config, from)) {
      return sock.sendMessage(from, { text: style.renderError(['Reserve au proprietaire.']) });
    }
    const code = args.join(' ');
    if (!code) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .eval <code>']) });

    try {
      let result = eval(code);
      if (typeof result !== 'string') result = inspect(result, { depth: 2 });
      await sock.sendMessage(from, { text: style.renderSuccess([`Resultat : ${result}`]) });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([`Erreur : ${e.message}`]) });
    }
  }
};
