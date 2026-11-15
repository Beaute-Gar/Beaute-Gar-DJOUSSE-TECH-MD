'use strict';

/**
 * menu-ui.js — menu du bot.
 * `.menu`        : logo + bouton/liste des categories (repli sommaire court)
 * `.menu <cat>`  : commandes d'une categorie
 * `.menu all`    : menu complet (toutes les commandes) en legende du logo
 */

const path = require('path');
const fs = require('fs');
const db = require('./database');
const cmdHandler = require('../handlers/command-handler');
const interactive = require('./interactive');

const CATEGORIES = [
  { key: 'general', label: 'GENERAL' },
  { key: 'groupe', label: 'GROUPE' },
  { key: 'protection', label: 'PROTECTION' },
  { key: 'sticker-media', label: 'STICKER & MEDIA' },
  { key: 'outils', label: 'OUTILS' },
  { key: 'ia', label: 'INTELLIGENCE IA' },
  { key: 'fun', label: 'DIVERTISSEMENT' },
  { key: 'recherche', label: 'RECHERCHE' },
  { key: 'owner', label: 'OWNER' },
  { key: 'divers', label: 'DIVERS' },
  { key: 'telechargement', label: 'TELECHARGEMENT' },
  { key: 'jeux', label: 'JEUX' }
];

const ROWS_PER_SECTION = 10;

// Commandes mises en avant dans le menu (si elles existent).
const HIGHLIGHTS = [
  { cmd: 'promo', label: 'promo', desc: 'cotes, pronos, .promo value, .promo compare' },
  { cmd: 'vv', label: 'vv', desc: 'récupérer une vue unique' },
  { cmd: 'play', label: 'play', desc: 'télécharger un audio' }
];

function highlightLines(config) {
  const prefix = getPrefix(config);
  return HIGHLIGHTS
    .filter((h) => cmdHandler.find(h.cmd))
    .map((h) => `│  ✦ ${prefix}${h.label} — ${h.desc}`);
}

function getPrefix(config) {
  return db.getSetting('prefix', config && config.prefix ? config.prefix : '.');
}

function getBotName(config) {
  return db.getSetting('botName', config && config.botName ? config.botName : 'BOT');
}

function getLogoPath() {
  return path.join(__dirname, '../../logo.jpg');
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function listFor(catKey) {
  return (cmdHandler.byCategory.get(catKey) || [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
}

function headerLines(config) {
  return [
    '╭┄┄『 MENU DU BOT 』┄❍',
    '│',
    `│✦ Nom : ${getBotName(config)}`,
    `│✦ Prefix : ${getPrefix(config)}`,
    `│✦ Total : ${cmdHandler.commands.size} commandes`,
    '│'
  ];
}

function footerLines(config) {
  return [
    '│',
    `│✦ Astuce : ${getPrefix(config)}menu <categorie>`,
    '╰┄┄┄┄┄┄┄┄┄┄┄┄⪼'
  ];
}

function buildMenuSummaryText(config) {
  const lines = headerLines(config);
  lines.pop(); // retire le separateur avant les categories
  lines.push('│');

  for (const cat of CATEGORIES) {
    const list = listFor(cat.key);
    if (!list.length) continue;
    lines.push(`│「 ${cat.label} 」 ⟨ ${list.length} ⟩`);
    lines.push(`│  ✦ ${getPrefix(config)}menu ${cat.key}`);
  }

  const highlights = highlightLines(config);
  if (highlights.length) {
    lines.push('│「 NOUVEAU 」');
    lines.push(...highlights);
  }

  lines.push('│');
  lines.push(`│✦ Astuce : ${getPrefix(config)}menu all pour tout voir`);
  lines.push('╰┄┄┄┄┄┄┄┄┄┄┄┄⪼');
  return lines.join('\n');
}

function buildCategoryText(catKey, config) {
  const cat = CATEGORIES.find(c => c.key === catKey);
  const label = cat ? cat.label : String(catKey || '').toUpperCase();
  const list = listFor(catKey);

  if (!list.length) {
    return `╭『 ${label} 』\n│✦ Aucune commande disponible\n╰┄┄┄┄┄┄┄┄┄┄┄┄⪼`;
  }

  const prefix = getPrefix(config);
  const lines = headerLines(config);
  lines.push(`│「 ${label} 」 ⟨ ${list.length} ⟩`);
  for (const c of list) lines.push(`│  ✦ ${prefix}${c.name}`);
  lines.push(...footerLines(config));
  return lines.join('\n');
}

function buildFullMenuText(config) {
  const prefix = getPrefix(config);
  let menuText = '╭┄┄『 MENU DU BOT 』┄❍\n│\n';
  menuText += `│✦ Nom : ${getBotName(config)}\n`;
  menuText += `│✦ Prefix : ${prefix}\n`;
  menuText += `│✦ Total : ${cmdHandler.commands.size} commandes\n│\n`;

  for (const cat of CATEGORIES) {
    const list = listFor(cat.key);
    if (!list.length) continue;
    menuText += `│「 ${cat.label} 」 ⟨ ${list.length} ⟩\n`;
    for (const c of list) {
      menuText += `│  ✦ ${prefix}${c.name}\n`;
    }
    menuText += '│\n';
  }

  const highlights = highlightLines(config);
  if (highlights.length) {
    menuText += '│「 NOUVEAU 」\n';
    menuText += highlights.join('\n') + '\n';
    menuText += '│\n';
  }

  menuText += '╰┄┄┄┄┄┄┄┄┄┄┄┄⪼';
  return menuText;
}

function readLogo() {
  const imgPath = getLogoPath();
  return fs.existsSync(imgPath) ? fs.readFileSync(imgPath) : null;
}

async function sendSummary(sock, from, m, config) {
  const text = buildMenuSummaryText(config);
  const logo = readLogo();

  if (logo) {
    try {
      await sock.sendMessage(from, { image: logo, caption: text }, { quoted: m });
      return;
    } catch (e) {
      console.error('[menu] envoi logo + sommaire impossible :', e.message);
    }
  }

  await sock.sendMessage(from, { text }, { quoted: m });
}

function buildCategorySections(config) {
  const prefix = getPrefix(config);
  const rows = CATEGORIES
    .filter(cat => listFor(cat.key).length)
    .map(cat => ({
      header: '',
      title: cat.label,
      description: `${listFor(cat.key).length} commandes`,
      id: `${prefix}menu ${cat.key}`
    }));

  const sections = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_SECTION) {
    sections.push({
      title: i === 0 ? 'Categories' : 'Plus de categories',
      rows: rows.slice(i, i + ROWS_PER_SECTION)
    });
  }
  return sections;
}

async function sendInteractiveSummary(sock, from, m, config) {
  const logo = readLogo();

  await interactive.sendNativeButtons(sock, from, {
    text: 'Choisissez une categorie',
    image: logo || undefined,
    quoted: m,
    buttons: [
      {
        label: 'Choisir une categorie',
        sections: buildCategorySections(config)
      }
    ]
  });
}

async function sendFullMenu(sock, from, m, config) {
  const text = buildFullMenuText(config);
  const logo = readLogo();

  // Une legende WhatsApp est limitee a ~1024 caracteres : le menu complet
  // doit partir en texte separe pour ne pas etre tronque.
  if (logo && text.length <= 900) {
    try {
      await sock.sendMessage(from, { image: logo, caption: text }, { quoted: m });
      return;
    } catch (e) {
      console.error('[menu] envoi image + legende impossible :', e.message);
    }
  }

  if (logo) {
    try {
      await sock.sendMessage(from, { image: logo, caption: '📋 MENU COMPLET' }, { quoted: m });
    } catch (e) {
      console.error('[menu] envoi du logo impossible :', e.message);
    }
  }

  await sock.sendMessage(from, { text }, { quoted: m });
}

async function sendMenu(sock, from, m, config, opts = {}) {
  const arg = String(opts.arg || '').trim();
  const wanted = normalize(arg);

  // .menu sommaire : force le sommaire court avec logo (100% fiable)
  if (wanted === 'sommaire' || wanted === 'simple' || wanted === 'texte') {
    await sendSummary(sock, from, m, config);
    return;
  }

  // .menu list : force le menu a boutons (liste des categories)
  if (wanted === 'list' || wanted === 'liste' || wanted === 'boutons') {
    try {
      await sendInteractiveSummary(sock, from, m, config);
    } catch (e) {
      console.error('[menu] message interactif indisponible, envoi du sommaire :', e.message);
      await sendSummary(sock, from, m, config);
    }
    return;
  }

  // .menu all : menu complet
  if (wanted === 'all' || wanted === 'tout' || wanted === 'full') {
    await sendFullMenu(sock, from, m, config);
    return;
  }

  // .menu <categorie>
  if (wanted) {
    const cat = CATEGORIES.find(c =>
      normalize(c.key) === wanted ||
      normalize(c.label) === wanted ||
      normalize(c.key).includes(wanted) ||
      wanted.includes(normalize(c.key))
    );

    if (!cat) {
      const names = CATEGORIES.map(c => c.key).join(', ');
      await sock.sendMessage(from, {
        text: `Categorie introuvable.\nDisponibles : ${names}, all`
      }, { quoted: m });
      return;
    }

    await sock.sendMessage(from, { text: buildCategoryText(cat.key, config) }, { quoted: m });
    return;
  }

  // .menu : logo + un seul bouton qui ouvre la liste des categories.
  // Si WhatsApp ne supporte pas, on envoie un sommaire court (pas toutes les commandes).
  try {
    await sendInteractiveSummary(sock, from, m, config);
  } catch (e) {
    console.error('[menu] message interactif indisponible, envoi du sommaire :', e.message);
    await sendSummary(sock, from, m, config);
  }
}

/**
 * Clic sur le bouton/liste "Choisir une categorie".
 * L'id envoye est par exemple ".menu groupe" ou "menu:cat:groupe".
 */
async function handleMenuInteraction(sock, m, from, config) {
  const id = interactive.extractReplyId(m);
  if (!id) return false;

  const prefix = getPrefix(config);
  let arg = null;

  if (id.startsWith('menu:cat:')) {
    arg = id.slice('menu:cat:'.length);
  } else {
    const raw = id.trim();
    const body = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
    const [cmd, ...rest] = body.split(/\s+/);
    if (cmd.toLowerCase() !== 'menu') return false;
    arg = rest.join(' ');
  }

  await sendMenu(sock, from, m, config, { arg });
  return true;
}

module.exports = {
  CATEGORIES,
  buildMenuSummaryText,
  buildCategoryText,
  buildFullMenuText,
  sendSummary,
  sendFullMenu,
  sendMenu,
  handleMenuInteraction
};
