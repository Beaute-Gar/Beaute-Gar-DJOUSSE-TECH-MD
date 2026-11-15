'use strict';
const style = require('../../config/style');
const db = require('../../lib/database');
const bw = require('../../lib/badwords');
const { isGroup, getGroupMeta, isAdmin, isBotAdmin } = require('../../lib/helpers');

// Les 16 filtres du moteur de protection, dans l'ordre d'affichage.
const FILTERS = [
  ['antilink', 'Antilink'],
  ['antispam', 'Antispam'],
  ['antiflood', 'Antiflood'],
  ['antibadword', 'Antibadword'],
  ['antimedia', 'Antimedia'],
  ['antisticker', 'Antisticker'],
  ['antitag', 'Antitag'],
  ['antivirtex', 'Antivirtex'],
  ['antivoice', 'Antivocal'],
  ['antipoll', 'Antisondage'],
  ['anticontact', 'Anticontact'],
  ['antiforward', 'Antitransfert'],
  ['antistatus', 'Antistatut'],
  ['antibot', 'Antibot'],
  ['antidocument', 'Antidocument'],
  ['antilive', 'Antilive']
];

const ON_WORDS = ['on', 'all', 'tout', 'toutes', 'activer', 'active'];
const OFF_WORDS = ['off', 'stop', 'desactiver', 'desactive', 'couper'];
const STATUS_WORDS = ['status', 'etat', 'voir', 'liste'];

const status = (val) => (val ? '✅ ON' : '❌ OFF');
const yesNo = (val) => (val ? 'OUI' : 'NON');

module.exports = {
  name: 'protection',
  aliases: ['secu', 'securite'],
  category: 'protection',
  description: 'Active toutes les protections du groupe (ou affiche leur etat)',
  async execute(sock, m, from, args) {
    if (!isGroup(from)) {
      return sock.sendMessage(from, { text: style.renderError(['Reserve aux groupes.']) });
    }

    const meta = await getGroupMeta(sock, from);
    if (!meta) {
      return sock.sendMessage(from, { text: style.renderError(['Impossible de recuperer le groupe.']) });
    }
    if (!m.key.fromMe && !isAdmin(meta, m.key.participant || from)) {
      return sock.sendMessage(from, { text: style.renderError(['Admin uniquement.']) });
    }

    const arg = (args[0] || '').toLowerCase();
    const onlyStatus = STATUS_WORDS.includes(arg);

    let note;

    if (onlyStatus) {
      note = 'Etat des protections';
    } else {
      if (arg && !ON_WORDS.includes(arg) && !OFF_WORDS.includes(arg)) {
        return sock.sendMessage(from, {
          text: style.renderInfo([
            'Usage : .protection on | off | status',
            'Sans argument, .protection active tout.'
          ])
        });
      }

      const enable = !OFF_WORDS.includes(arg);
      const settings = db.getSetting(`protection_${from}`, {});

      // 1. Tous les filtres
      for (const [key] of FILTERS) settings[key] = enable;

      // 2. Valeurs par defaut utiles au moteur
      if (!Number.isInteger(settings.taglimit) || settings.taglimit < 1) settings.taglimit = 5;
      settings.antidelete = enable;

      db.setSetting(`protection_${from}`, settings);

      // 3. Antidelete (cle dediee utilisee par le handler)
      db.setSetting(`antidelete_${from}`, enable);

      // 4. Limite d'avertissements par defaut
      if (!db.getSetting(`warnlimit_${from}`)) db.setSetting(`warnlimit_${from}`, 3);

      note = enable ? 'Toutes les protections ACTIVEES' : 'Toutes les protections DESACTIVEES';
    }

    // ── Panneau ──
    const settings = db.getSetting(`protection_${from}`, {});
    const warnLimit = db.getSetting(`warnlimit_${from}`, 3);
    const badWords = db.getSetting(`badwords_${from}`, []);
    const blacklist = db.getSetting(`blacklist_${from}`, []);
    const antidelete = db.getSetting(`antidelete_${from}`, settings.antidelete === true);
    const botAdmin = isBotAdmin(meta, sock);

    const active = FILTERS.filter(([key]) => settings[key]).length;
    const lines = [
      note,
      `Filtres : ${active}/${FILTERS.length} actifs`,
      `Bot admin : ${yesNo(botAdmin)}`,
      '────────────'
    ];

    for (const [key, label] of FILTERS) {
      lines.push(`${label} : ${status(settings[key])}`);
    }

    lines.push(`Antidelete : ${status(antidelete)}`);
    lines.push('────────────');

    if (settings.antimedia) {
      lines.push('ℹ️ Antimedia coupe photos, videos, audio et documents.');
    }

    if (settings.antibadword) {
      lines.push(`ℹ️ Liste intégrée : ${bw.all().length} mots (7 catégories).`);
    }

    lines.push(`Sanction : suppression → avertissement → expulsion`);
    lines.push(`Limite avertissements : ${warnLimit}`);
    lines.push(`Mots personnalisés : ${badWords.length}`);
    lines.push(`Blacklist : ${blacklist.length}`);

    if (!botAdmin) {
      lines.push('⚠️ Promos le bot admin pour supprimer et expulser.');
    }

    await sock.sendMessage(from, {
      text: style.box('PROTECTIONS DU GROUPE', lines)
    });
  }
};
