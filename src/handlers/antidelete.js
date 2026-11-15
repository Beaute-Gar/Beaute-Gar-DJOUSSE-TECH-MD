'use strict';
const fs = require('fs');
const path = require('path');
const style = require('../config/style');
const db = require('../lib/database');
const { isGroup, getGroupMeta } = require('../lib/helpers');
const { phoneOf, pretty, digits } = require('../lib/phone');
const { unwrap, getText } = require('./protection-handler');

let downloadMediaMessage = null;
for (const pkg of ['@whiskeysockets/baileys', 'baileys', '@adiwajshing/baileys']) {
  try { downloadMediaMessage = require(pkg).downloadMediaMessage; if (downloadMediaMessage) break; } catch (e) {}
}

const DIR = path.join(__dirname, '..', '..', 'storage', 'antidelete');
const MAX_ENTRIES = 4000;
const TTL = 2 * 60 * 60 * 1000;     // les messages restent 2 h en memoire
const MAX_MEDIA = 25 * 1024 * 1024; // 25 Mo max par media
try { fs.mkdirSync(DIR, { recursive: true }); } catch (e) {}

const MEDIA = {
  imageMessage:    { ext: 'jpg' },
  videoMessage:    { ext: 'mp4' },
  audioMessage:    { ext: 'ogg' },
  stickerMessage:  { ext: 'webp' },
  documentMessage: { ext: 'bin' }
};
const quiet = { info() {}, error() {}, warn() {}, debug() {}, trace() {}, fatal() {}, child() { return this; } };
const cache = new Map();

const enabled = (chat) => !!db.getSetting(`antidelete_${chat}`, false);

function dropEntry(e) {
  if (e && e.file) fs.promises.unlink(e.file).catch(() => {});
}
function when(ts) {
  const tz = db.getSetting('timezone', 'Africa/Douala');
  try {
    return new Date(ts).toLocaleString('fr-FR', { timeZone: tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return new Date(ts).toISOString(); }
}
const toNumber = (v) => (v && typeof v === 'object' && v.toNumber ? v.toNumber() : Number(v) || 0);
const whoLine = (e) => `Auteur : ${pretty(e.phone)}${e.name ? ` (${e.name})` : ''}`;

/* ---------- memorisation de chaque message ---------- */
async function remember(sock, m) {
  const chat = m.key.remoteJid;
  if (m.key.fromMe || !enabled(chat)) return;

  const raw = m.message;
  if (raw.viewOnceMessage || raw.viewOnceMessageV2 || raw.viewOnceMessageV2Extension) return; // vue unique : jamais conserve

  const content = unwrap(raw);
  const type = Object.keys(MEDIA).find(t => content[t]);
  if (type && content[type].viewOnce) return;

  const text = getText(content);
  if (!type && !text) return;

  const sender = m.key.participant || chat;
  const alts = [m.key.participantPn, m.key.participantAlt, m.key.senderPn, m.key.remoteJidAlt].filter(Boolean);

  let meta = null;
  if (isGroup(chat)) { try { meta = await getGroupMeta(sock, chat); } catch (e) {} }

  const entry = {
    chat, id: m.key.id, sender, name: m.pushName || '', ts: Date.now(),
    phone: phoneOf(sock, meta, sender, ...alts),
    type, text, file: null, pending: null,
    mimetype: type ? content[type].mimetype : '',
    fileName: type === 'documentMessage' ? content[type].fileName : '',
    ptt: type === 'audioMessage' ? !!content[type].ptt : false
  };

  if (type && downloadMediaMessage && toNumber(content[type].fileLength) <= MAX_MEDIA) {
    entry.pending = (async () => {
      const buf = await downloadMediaMessage(m, 'buffer', {}, { logger: quiet, reuploadRequest: sock.updateMediaMessage });
      const file = path.join(DIR, `${Date.now()}_${String(m.key.id).replace(/[^\w-]/g, '')}.${MEDIA[type].ext}`);
      await fs.promises.writeFile(file, buf);
      entry.file = file;
    })().catch(e => console.error('[ANTIDELETE] media:', e.message));
  }

  cache.set(`${chat}:${m.key.id}`, entry);
  while (cache.size > MAX_ENTRIES) {
    const k = cache.keys().next().value;
    dropEntry(cache.get(k));
    cache.delete(k);
  }
}

/* ---------- restitution d'un message supprime ---------- */
async function onRevoke(sock, m, proto) {
  const chat = m.key.remoteJid;
  const k = `${chat}:${proto.key && proto.key.id}`;
  const entry = cache.get(k);
  if (!entry) return;
  cache.delete(k);
  if (entry.pending) await entry.pending;

  let meta = null;
  if (isGroup(chat)) { try { meta = await getGroupMeta(sock, chat); } catch (e) {} }
  if (!entry.phone) entry.phone = phoneOf(sock, meta, entry.sender);

  const delJid = m.key.participant || chat;
  const delPhone = phoneOf(sock, meta, delJid, m.key.participantPn, m.key.participantAlt);
  const sameUser = digits(delJid) === digits(entry.sender) || (delPhone && delPhone === entry.phone);

  const lines = ['Message supprime', whoLine(entry)];
  if (!sameUser) lines.push(`Supprime par : ${pretty(delPhone)}`);
  lines.push(`Envoye : ${when(entry.ts)}`);
  if (entry.text) lines.push('', entry.text);

  try {
    const f = entry.file && fs.existsSync(entry.file) ? entry.file : null;

    if (!entry.type) {
      await sock.sendMessage(chat, { text: style.renderInfo(lines) });
    } else if (!f) {
      await sock.sendMessage(chat, { text: style.renderInfo([...lines, '[media non recuperable]']) });
    } else {
      const buf = await fs.promises.readFile(f);
      const caption = style.renderInfo(lines).slice(0, 1000);
      if (entry.type === 'imageMessage') {
        await sock.sendMessage(chat, { image: buf, caption });
      } else if (entry.type === 'videoMessage') {
        await sock.sendMessage(chat, { video: buf, caption });
      } else if (entry.type === 'documentMessage') {
        await sock.sendMessage(chat, { document: buf, mimetype: entry.mimetype || 'application/octet-stream', fileName: entry.fileName || 'fichier', caption });
      } else if (entry.type === 'audioMessage') {
        await sock.sendMessage(chat, { text: style.renderInfo(lines) });
        await sock.sendMessage(chat, { audio: buf, mimetype: entry.mimetype || 'audio/ogg; codecs=opus', ptt: entry.ptt });
      } else if (entry.type === 'stickerMessage') {
        await sock.sendMessage(chat, { text: style.renderInfo(lines) });
        await sock.sendMessage(chat, { sticker: buf });
      }
    }
  } catch (e) {
    console.error('[ANTIDELETE] restitution:', e.message);
  } finally {
    dropEntry(entry);
  }
}

/* ---------- message modifie : avant / apres ---------- */
async function onEdit(sock, m, proto) {
  const chat = m.key.remoteJid;
  const entry = cache.get(`${chat}:${proto.key && proto.key.id}`);
  if (!entry) return;

  const newText = getText(unwrap(proto.editedMessage));
  if (!newText || !entry.text || newText === entry.text) { if (newText) entry.text = newText; return; }

  const lines = ['Message modifie', whoLine(entry), '', `Avant : ${entry.text}`, `Apres : ${newText}`];
  entry.text = newText;
  try { await sock.sendMessage(chat, { text: style.renderInfo(lines) }); }
  catch (e) { console.error('[ANTIDELETE] edit:', e.message); }
}

/* ---------- point d'entree : retourne true si le message est une suppression ---------- */
async function track(sock, m) {
  if (!m.message) return false;
  const chat = m.key.remoteJid;
  if (!chat || chat === 'status@broadcast') return false;

  const proto = unwrap(m.message).protocolMessage;
  if (proto) {
    if (proto.type === 0 || proto.type === 'REVOKE') {
      if (enabled(chat)) await onRevoke(sock, m, proto);
      return true;
    }
    if (proto.editedMessage && enabled(chat)) await onEdit(sock, m, proto);
    return false; // une modification continue vers les protections (antilink, etc.)
  }

  remember(sock, m).catch(e => console.error('[ANTIDELETE] memo:', e.message));
  return false;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, e] of cache) if (now - e.ts > TTL) { cache.delete(k); dropEntry(e); }
  try {
    for (const f of fs.readdirSync(DIR)) {
      const p = path.join(DIR, f);
      if (now - fs.statSync(p).mtimeMs > TTL + 600000) fs.unlinkSync(p);
    }
  } catch (e) {}
}, 10 * 60 * 1000).unref();

module.exports = { track };
