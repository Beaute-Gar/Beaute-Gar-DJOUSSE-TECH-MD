'use strict';

/**
 * style.js — DJOUSSE TECH EVOLUTION
 * Style unique : cadres ╭┄┄『 』┄❍ ... ╰┄┄┄┄┄┄┄┄┄┄┄┄⪼
 * Word-wrap mobile : 1ere ligne │✦, continuations │␣␣, max 32 chars
 */

const MATH_MAP = {};

const buildMathRange = (start, chars) => {
  [...chars].forEach((c, i) => {
    MATH_MAP[c] = String.fromCodePoint(start + i);
  });
};

buildMathRange(0x1D670, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
buildMathRange(0x1D68A, 'abcdefghijklmnopqrstuvwxyz');
buildMathRange(0x1D7F6, '0123456789');

function toUnicode(str) {
  return String(str).replace(/[A-Za-z0-9]/g, ch => MATH_MAP[ch] || ch);
}

/* ─────────────── LARGEUR VISUELLE ─────────────── */

function dispWidth(str) {
  let width = 0;
  for (const ch of String(str)) {
    const code = ch.codePointAt(0);
    if (
      (code >= 0x1F000 && code <= 0x1FAFF) ||
      (code >= 0x2600 && code <= 0x27BF) ||
      (code >= 0x2B00 && code <= 0x2BFF) ||
      (code >= 0xFE00 && code <= 0xFE0F)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

/* ─────────────── WORD-WRAP ─────────────── */

/**
 * Replie un texte sur plusieurs lignes en coupant uniquement aux espaces.
 * Ne coupe jamais un mot au milieu.
 */
function wrapText(text, maxWidth = 32) {
  const source = String(text ?? '').replace(/[\r\n\t]+/g, ' ').trim();
  if (!source) return [''];

  const words = source.split(/\s+/);
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (dispWidth(candidate) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/* ─────────────── IDENTITÉ VISUELLE ─────────────── */

const frameHeader = title => `╭┄┄『 ${toUnicode(title)} 』┄❍`;
const frameFooter = () => '╰┄┄┄┄┄┄┄┄┄┄┄┄⪼';

const buildFrame = (title, lines) =>
  [frameHeader(title), ...lines, frameFooter()].join('\n');

const listHeader = title => `╭『 ${toUnicode(title)} 』`;
const listItem = (n, label) =>
  `┊${String(n).padStart(2)} ⟩⟩ ${label}`;

const bullet = (label, value) =>
  `│✦ ${toUnicode(label)}${value === undefined ? '' : `: ${value}`}`;

const row = text => `│ ${text}`;
const blank = () => '│';
const title = text => `│「 ${text} 」`;
const note = text => `│✦ ${text}`;

/* ─────────────── COULEURS TERMINAL ─────────────── */

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[96m',
  blue: '\x1b[94m',
  green: '\x1b[92m',
  yellow: '\x1b[93m',
  red: '\x1b[91m',
  white: '\x1b[97m',
  magenta: '\x1b[95m',
  gray: '\x1b[90m'
};

function supportsColor() {
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.FORCE_COLOR === '0') return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(
    process.stdout &&
    process.stdout.isTTY &&
    process.env.TERM !== 'dumb'
  );
}

const paint = (text, color) =>
  supportsColor() ? `${color}${text}${ANSI.reset}` : String(text);

const cyan = text => paint(text, ANSI.cyan);
const green = text => paint(text, ANSI.green);
const yellow = text => paint(text, ANSI.yellow);
const red = text => paint(text, ANSI.red);
const gray = text => paint(text, ANSI.gray);
const white = text => paint(text, ANSI.white);
const bold = text => paint(text, ANSI.bold);
const magenta = text => paint(text, ANSI.magenta);

/* ─────────────── CADRES AU STYLE UNIQUE ─────────────── */

const HAS_ICON_REGEX = /^[\s]*(?:[│┊|•✦\-*>✔✅❌⚠️💡📌👤📱🌍🎖️👑👥📊🏷️🆔📅📝🎬🎵🔢🌐🧠⚡🟢🔴🟡])|^[\u{1F300}-\u{1FAFF}]/u;

/**
 * Boite au style ╭┄┄『 』┄❍ ... ╰┄┄┄┄┄┄┄┄┄┄┄┄⪼
 * Supporte les sauts de lignes et les emojis contextuels
 */
const box = (heading, rows = []) => {
  const body = [];
  for (const r of rows) {
    if (r === undefined || r === null) continue;
    const str = String(r);
    if (!str.trim()) {
      body.push('│');
      continue;
    }
    const wrapped = wrapText(str, 34);
    wrapped.forEach((line, i) => {
      const hasIcon = HAS_ICON_REGEX.test(line);
      if (hasIcon) {
        body.push(i === 0 ? `│ ${line}` : `│   ${line}`);
      } else {
        body.push(i === 0 ? `│✦ ${line}` : `│  ${line}`);
      }
    });
  }
  return buildFrame(heading, body);
};

/**
 * Banniere simple au meme style.
 */
const banner = (text) =>
  buildFrame(
    'BANNIERE',
    [`│✦ ${String(text ?? '').replace(/[\r\n\t]+/g, ' ')}`]
  );

/**
 * Compatibilite : ancienne signature conservee mais redirigee vers le style unique.
 */
const BOX_W = 48;
const boxTop = () => frameHeader('SYSTEM');
const boxRule = () => '';
const boxBottom = () => frameFooter();
const boxRow = text => `│✦ ${String(text ?? '').replace(/[\r\n\t]+/g, ' ')}`;

/* ─────────────── TABLEAU DE BORD AU DÉMARRAGE ─────────────── */

function renderStartupDashboard(status = {}) {
  const statusValue = (value, fallback = 'INCONNU') =>
    value === undefined || value === null || value === ''
      ? fallback
      : String(value);

  const connection = statusValue(status.connection);
  const ai = statusValue(status.ai);
  const lastError = statusValue(status.lastError, 'aucune');

  const rows = [
    '',
    'DJOUSSE TECH EVOLUTION',
    'WHATSAPP AUTOMATION SYSTEM',
    'Des solutions fiables pour un avenir',
    'sans limites',
    '',
    'SYSTEME',
    `Processus : ${statusValue(status.process)}`,
    `Version bot : ${statusValue(status.version)}`,
    `Runtime Node.js : ${statusValue(status.nodeVersion)}`,
    `Stockage : ${statusValue(status.storage)}`,
    `Commandes : ${statusValue(status.commands, '0')} chargees`,
    `Plugins : ${statusValue(status.plugins, '0')} charges`,
    `Protections : ${statusValue(status.protections)}`,
    `Intelligence IA : ${ai}`,
    'Services externes : NON TESTES',
    '',
    'SESSION WHATSAPP',
    `ID : ${statusValue(status.sessionId)}`,
    `Connexion : ${connection}`,
    `Sessions actives : ${statusValue(status.activeSessions, '0')}`,
    `Derniere erreur : ${lastError}`,
    '',
    'DJOUSSE TECH EVOLUTION'
  ];

  const colorize = (text, color) => {
    return supportsColor() ? `${color}${text}${ANSI.reset}` : String(text);
  };

  const content = rows.map((value, index) => {
    let line = String(value);

    if (index === 1 || index === 2 || index === 3 || index === 4) {
      line = colorize(value, ANSI.cyan);
    } else if (value === 'SYSTEME' || value === 'SESSION WHATSAPP') {
      line = colorize(value, ANSI.bold + ANSI.magenta);
    } else if (value.startsWith('Connexion :')) {
      const state = connection.toLowerCase();
      const color = state.includes('connect') && !state.includes('disconnect')
        ? ANSI.green
        : state.includes('error') || state.includes('erreur')
          ? ANSI.red
          : ANSI.yellow;
      line = colorize(value, color);
    } else if (value.startsWith('Derniere erreur :')) {
      line = colorize(value, lastError.toLowerCase() === 'aucune' ? ANSI.green : ANSI.yellow);
    } else if (value.startsWith('Intelligence IA :')) {
      line = colorize(value, ai.toLowerCase().includes('activ') ? ANSI.green : ANSI.yellow);
    } else if (value === 'Services externes : NON TESTES') {
      line = colorize(value, ANSI.gray);
    } else if (value === 'DJOUSSE TECH EVOLUTION') {
      line = colorize(value, ANSI.cyan);
    } else if (value.trim() !== '') {
      line = colorize(value, ANSI.white);
    }

    return `│✦ ${line}`;
  });

  return [
    frameHeader('DJOUSSE TECH | SYSTEM CONSOLE'),
    ...content,
    frameFooter()
  ].join('\n');
}

/* ─────────────── AFFICHAGE DES CATÉGORIES ─────────────── */

const catBox = (emoji, label, count) => {
  const inner = `  ${emoji}  ${toUnicode(label)}  ⟨ ${count} ⟩`;
  const bar = '━'.repeat(Math.max(dispWidth(inner), 6));
  return `┏${bar}┓\n┃${inner}\n┗${bar}┛`;
};

const numItem = (n, cmd) =>
  `┊ ${toUnicode(String(n).padStart(2, '0'))} ⟩ .${cmd}`;

const backBox = label =>
  `╭${'┄'.repeat(14)}⪼\n${listItem(0, label)}\n${frameFooter()}`;

/* ─────────────── SIGNATURES ─────────────── */

function signature() {
  return `MULTI-DEVICE WHATSAPP BOT\nMADE BY DJOUSSE TECH`;
}

const signatureBox = () =>
  `╭${'┄'.repeat(14)}⪼\n${signature()
    .split('\n')
    .map(line => `│  ${line}`)
    .join('\n')}\n${frameFooter()}`;

/* ─────────────── MESSAGES DU BOT ─────────────── */

const renderNotice = (heading, lines) => {
  const body = [];
  let icon = '✦';
  let cleanHeading = heading;
  if (heading === 'SUCCÈS') { icon = '✅'; cleanHeading = 'SUCCÈS'; }
  else if (heading === 'ERREUR') { icon = '❌'; cleanHeading = 'ATTENTION'; }
  else if (heading === 'INFO') { icon = '💡'; cleanHeading = 'GUIDE & INFO'; }

  body.push('│');
  for (const line of lines) {
    if (line === undefined || line === null) continue;
    const str = String(line);
    if (!str.trim()) {
      body.push('│');
      continue;
    }
    const wrapped = wrapText(str, 34);
    wrapped.forEach((chunk, i) => {
      const hasOwnIcon = HAS_ICON_REGEX.test(chunk);
      if (hasOwnIcon) {
        body.push(i === 0 ? `│ ${chunk}` : `│   ${chunk}`);
      } else {
        body.push(i === 0 ? `│ ${icon} ${chunk}` : `│   ${chunk}`);
      }
    });
  }
  body.push('│');
  return buildFrame(cleanHeading, body);
};

const renderInfo = lines => renderNotice('INFO', lines);
const renderSuccess = lines => renderNotice('SUCCÈS', lines);
const renderError = lines => renderNotice('ERREUR', lines);
const renderSaisie = hint => renderNotice('SAISISSEZ REQUIS', [hint]);

function renderOutgoingText(value) {
  if (typeof value !== 'string' || !value.trim()) return value;

  const text = value.trim();
  const alreadyRendered = [
    '╭┄┄『 ',
    '╭『 ',
    '╭┄┄┄┄',
  ].some(marker => text.startsWith(marker));
  if (alreadyRendered) return value;

  const isError = /^(?:❌|⚠|🚫|⛔|✖|error\b|erreur\b|failed\b|échec\b)/i.test(text);
  const isSuccess = /^(?:✅|☑|✔|done\b|success\b|succès\b|completed\b|saved\b|added\b|removed\b|sent\b|updated\b|created\b)/i.test(text);
  const heading = isError ? 'ERREUR' : isSuccess ? 'SUCCÈS' : 'INFO';
  const lines = text.split(/\r?\n/);
  const rendered = renderNotice(heading, lines);

  if (rendered.length <= 4096) return rendered;

  const compact = renderNotice(heading, [text]);
  return compact.length <= 4096 ? compact : value;
}

/* ─────────────── DATE ET HEURE ─────────────── */

const two = n => String(n).padStart(2, '0');

function nowTime() {
  const date = new Date();
  return `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

function nowDate() {
  const date = new Date();
  return `${two(date.getDate())}/${two(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/* ─────────────── EXPORTS ─────────────── */

module.exports = {
  toUnicode,
  frameHeader,
  frameFooter,
  buildFrame,
  listHeader,
  listItem,
  bullet,
  row,
  blank,
  title,
  note,
  box,
  banner,
  renderStartupDashboard,
  boxTop,
  boxRule,
  boxBottom,
  boxRow,
  BOX_W,
  catBox,
  numItem,
  dispWidth,
  wrapText,
  backBox,
  signatureBox,
  signature,
  renderInfo,
  renderSuccess,
  renderError,
  renderSaisie,
  renderOutgoingText,
  two,
  nowTime,
  nowDate
};