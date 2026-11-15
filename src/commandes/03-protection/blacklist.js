'use strict';
const style = require('../../config/style');
const db = require('../../lib/database');
const { isGroup, getGroupMeta, isAdmin, isBotAdmin, isBot, getTarget } = require('../../lib/helpers');
const { phoneOf, pretty } = require('../../lib/phone');

module.exports = {
  name: 'blacklist',
  category: 'protection',
  description: 'Ajoute un membre à la blacklist (sans cible : affiche la liste)',
  async execute(sock, m, from, args) {
    if (!isGroup(from)) return sock.sendMessage(from, { text: style.renderError(['Réservé aux groupes.']) });
    const meta = await getGroupMeta(sock, from);
    if (!meta) return sock.sendMessage(from, { text: style.renderError(['Impossible de récupérer le groupe.']) });
    if (!isAdmin(meta, m.key.participant || from)) return sock.sendMessage(from, { text: style.renderError(['Admin uniquement.']) });

    const list = db.getSetting(`blacklist_${from}`, []);
    const target = getTarget(m);

    if (!target || target === from) {
      if (!list.length) return sock.sendMessage(from, { text: style.renderInfo(['La blacklist est vide.', 'Usage : .blacklist @membre']) });
      return sock.sendMessage(from, {
        text: style.box('BLACKLIST', list.map((j, i) => `${i + 1}. ${pretty(phoneOf(sock, meta, j) || j)}`)),
        mentions: list
      });
    }

    if (isBot(meta, sock, target)) return sock.sendMessage(from, { text: style.renderError(['Impossible de blacklister le bot.']) });
    if (isAdmin(meta, target)) return sock.sendMessage(from, { text: style.renderError(['Impossible de blacklister un admin.']) });

    const label = pretty(phoneOf(sock, meta, target) || target);
    if (list.includes(target)) {
      return sock.sendMessage(from, { text: style.renderInfo([`${label} est déjà dans la blacklist.`]), mentions: [target] });
    }

    list.push(target);
    db.setSetting(`blacklist_${from}`, list);

    const present = (meta.participants || []).some(p => p.id === target);
    let kickMsg = '';
    if (present) {
      if (isBotAdmin(meta, sock)) {
        try {
          await sock.groupParticipantsUpdate(from, [target], 'remove');
          kickMsg = 'Membre expulsé du groupe.';
        } catch (e) { kickMsg = `Expulsion impossible : ${e.message}`; }
      } else {
        kickMsg = "Le bot n'est pas admin : expulsion impossible.";
      }
    }

    await sock.sendMessage(from, {
      text: style.renderSuccess([`${label} ajouté à la blacklist.`, kickMsg].filter(Boolean)),
      mentions: [target]
    });
  }
};
