'use strict';
const style = require('../../config/style');
const config = require('../../config/config');

module.exports = {
  name: 'broadcast',
  category: 'owner',
  description: 'Envoie un message a tous les groupes ou le bot est present',
  async execute(sock, m, from, args) {
    if (!require('../../lib/auth').isOwner(sock, m, config, from)) {
      return sock.sendMessage(from, { text: style.renderError(['Reserve au proprietaire.']) });
    }
    const message = args.join(' ');
    if (!message) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .broadcast <message>']) });

    try {
      const groups = await sock.groupFetchAllParticipating();
      const groupIds = Object.keys(groups);
      await sock.sendMessage(from, { text: style.renderInfo([`Envoi en cours vers ${groupIds.length} groupe(s)...`]) });

      for (const id of groupIds) {
        await sock.sendMessage(id, { text: `📢 ANNONCE DU PROPRIETAIRE :\n\n${message}` });
        await new Promise(r => setTimeout(r, 2000)); // Anti-spam delay
      }
      await sock.sendMessage(from, { text: style.renderSuccess(['Diffusion terminee.']) });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([`Erreur broadcast : ${e.message}`]) });
    }
  }
};
