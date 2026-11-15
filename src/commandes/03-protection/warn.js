'use strict';
const style = require('../../config/style');
const db = require('../../lib/database');
const { isGroup, getGroupMeta, isAdmin, isBotAdmin, isBot, getTarget } = require('../../lib/helpers');
const { phoneOf, pretty } = require('../../lib/phone');

module.exports = {
  name: 'warn',
  category: 'protection',
  description: 'Avertit un membre',
  async execute(sock, m, from, args) {
    if (!isGroup(from)) return sock.sendMessage(from, { text: style.renderError(['Réservé aux groupes.']) });
    const meta = await getGroupMeta(sock, from);
    if (!meta) return sock.sendMessage(from, { text: style.renderError(['Impossible de récupérer le groupe.']) });
    if (!isAdmin(meta, m.key.participant || from)) return sock.sendMessage(from, { text: style.renderError(['Admin uniquement.']) });

    const target = getTarget(m);
    if (!target || target === from) return sock.sendMessage(from, { text: style.renderError(['Cible invalide. Mentionnez un membre ou répondez à son message.']) });

    if (isBot(meta, sock, target)) return sock.sendMessage(from, { text: style.renderError(['Impossible d\'avertir le bot.']) });
    if (isAdmin(meta, target)) return sock.sendMessage(from, { text: style.renderError(['Impossible d\'avertir un admin.']) });

    const warns = db.getSetting(`warns_${from}`, {});
    warns[target] = (warns[target] || 0) + 1;
    db.setSetting(`warns_${from}`, warns);

    const maxWarns = db.getSetting(`warnlimit_${from}`, 3);
    const reason = args.filter(a => !a.startsWith('@')).join(' ').trim();
    const label = pretty(phoneOf(sock, meta, target) || target);

    if (warns[target] >= maxWarns) {
      if (isBotAdmin(meta, sock)) {
        try {
          await sock.groupParticipantsUpdate(from, [target], 'remove');
          delete warns[target];
          db.setSetting(`warns_${from}`, warns);
          return sock.sendMessage(from, {
            text: style.renderError([`${label} a été expulsé pour ${maxWarns} avertissements.`]),
            mentions: [target]
          });
        } catch (e) {
          return sock.sendMessage(from, { text: style.renderError([`Expulsion impossible : ${e.message}`]) });
        }
      }
      return sock.sendMessage(from, {
        text: style.renderError([`${label} a atteint ${warns[target]}/${maxWarns} avertissements.`, "Le bot n'est pas admin : expulsion impossible."]),
        mentions: [target]
      });
    }

    await sock.sendMessage(from, {
      text: style.renderSuccess([`Avertissement ${warns[target]}/${maxWarns} pour ${label}.`, reason ? `Raison : ${reason}` : ''].filter(Boolean)),
      mentions: [target]
    });
  }
};
