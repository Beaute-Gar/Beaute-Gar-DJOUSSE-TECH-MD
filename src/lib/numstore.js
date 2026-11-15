'use strict';
const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '../../storage/database');
const DB_FILE = path.join(DB_DIR, 'saved_numbers.json');

// Garde uniquement les chiffres, 8 a 15 caracteres (format E.164), sinon null
function clean(n) {
  const d = String(n || '').replace(/\D/g, '');
  return d.length >= 8 && d.length <= 15 ? d : null;
}

function load() {
  try {
    if (!fs.existsSync(DB_FILE)) return [];
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!Array.isArray(data)) throw new Error('format invalide');
    return [...new Set(data.map(clean).filter(Boolean))];
  } catch (e) {
    // Fichier corrompu : on le met de cote au lieu de planter
    try { fs.copyFileSync(DB_FILE, DB_FILE + '.corrompu-' + Date.now()); } catch (_) {}
    return [];
  }
}

// Ecriture atomique : fichier temporaire puis renommage (pas de JSON a moitie ecrit)
function save(list) {
  fs.mkdirSync(DB_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

function merge(newNumbers) {
  const current = load();
  const all = [...new Set([...current, ...newNumbers.map(clean).filter(Boolean)])];
  save(all);
  return { all, added: all.length - current.length };
}

function remove(numbers) {
  const rm = new Set(numbers);
  const left = load().filter((n) => !rm.has(n));
  save(left);
  return left;
}

function clear() { save([]); }

const base = (jid) => String(jid || '').split('@')[0].split(':')[0];

function botNumber(sock) {
  return clean(base(sock && sock.user && sock.user.id));
}

function botIds(sock) {
  const u = (sock && sock.user) || {};
  return [u.id, u.lid].filter(Boolean).map(base);
}

// Numero reel d'un participant (ignore les identifiants LID qui ne sont pas des numeros)
function numberOf(p) {
  if (!p) return null;
  for (const c of [p.phoneNumber, p.jid, p.id]) {
    if (typeof c === 'string' && !c.endsWith('@lid')) {
      const n = clean(base(c));
      if (n) return n;
    }
  }
  return null;
}

// Proprietaire = le compte du bot lui-meme, ou un numero liste dans OWNER_NUMBERS (.env, separes par des virgules)
function isOwner(sock, m) {
  if (m && m.key && m.key.fromMe) return true;
  const raw = (m && m.key && (m.key.participant || m.key.remoteJid)) || '';
  if (raw.endsWith('@lid')) return false;
  const n = clean(base(raw));
  if (!n) return false;
  const owners = (process.env.OWNER_NUMBERS || '').split(',').map(clean).filter(Boolean);
  return n === botNumber(sock) || owners.includes(n);
}

function getArgs(m, args) {
  if (Array.isArray(args)) return args.map(String);
  const msg = (m && m.message) || {};
  const text = msg.conversation || (msg.extendedTextMessage && msg.extendedTextMessage.text) || '';
  return String(text).trim().split(/\s+/).slice(1);
}

function isGroupJid(jid) { return typeof jid === 'string' && jid.endsWith('@g.us'); }

// Utilise style.renderError / renderInfo / renderSuccess s'ils existent, sinon texte simple
function reply(style, kind, lines) {
  const arr = Array.isArray(lines) ? lines : [lines];
  try {
    const fn = style && style['render' + kind];
    if (typeof fn === 'function') return fn.call(style, arr);
  } catch (_) {}
  return arr.join('\n');
}

module.exports = {
  clean, load, save, merge, remove, clear,
  botNumber, botIds, numberOf, isOwner, getArgs, isGroupJid, reply
};