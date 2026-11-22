'use strict';
const style = require('../../config/style');
const { isGroup, getGroupMeta } = require('../../lib/helpers');

module.exports = {
  name: 'groupinfo',
  aliases: ['gcinfo'],
  category: 'groupe',
  description: 'Informations sur le groupe',
  async execute(sock, m, from) {
    if (!isGroup(from)) {
      return sock.sendMessage(from, {
        text: style.renderError(['Reserve aux groupes.'])
      });
    }

    const meta = await getGroupMeta(sock, from);
    if (!meta) {
      return sock.sendMessage(from, {
        text: style.renderError(['Impossible de recuperer les infos du groupe.'])
      });
    }

    const admins = meta.participants.filter(p => p.admin).length;
    const desc = (meta.desc || 'aucune').replace(/\s+/g, ' ').trim();

    await sock.sendMessage(from, {
      text: style.box('INFOS GROUPE', [
        '',
        `🏷️ Nom : ${meta.subject}`,
        `🆔 ID : ${meta.id}`,
        `👥 Membres : ${meta.participants.length}`,
        `👑 Admins : ${admins}`,
        `📅 Création : ${new Date(meta.creation * 1000).toLocaleDateString('fr-FR')}`,
        '',
        ...(desc && desc !== 'aucune' ? [`📝 Description :`, `${desc}`, ''] : [])
      ])
    });
  }
};