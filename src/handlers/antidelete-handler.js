'use strict';
const fs = require('fs');
const path = require('path');
const style = require('../config/style');
const paths = require('../config/paths');
const db = require('../lib/database');
const { downloadMediaMessage, extractMessageContent } = require('@whiskeysockets/baileys');
const { getGroupMeta, isAdmin } = require('../lib/helpers');
const { phoneOf, pretty } = require('../lib/phone');

// Caches globaux : ils survivent a un .reload du module.
const messageCache = global.__djousseMessageCache || (global.__djousseMessageCache = new Map());
const mediaStore = global.__djousseMediaStore || (global.__djousseMediaStore = new Map());
const MAX_CACHE = 500;
const MAX_MEDIA = 200;
const MAX_MEDIA_PER_CHAT = 30;
const VV_DIR = path.join(paths.storage, 'vv');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function safeName(value) {
  return String(value || '').replace(/[^a-zA-Z0-9._@-]/g, '_');
}

function vvPaths(chatId, id) {
  const dir = path.join(VV_DIR, safeName(chatId));
  const base = safeName(id);
  return {
    dir,
    meta: path.join(dir, base + '.json'),
    bin: path.join(dir, base + '.bin')
  };
}

function pruneDir(dir, max) {
  try {
    const metas = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    if (metas.length <= max) return;
    const entries = metas
      .map((f) => {
        const full = path.join(dir, f);
        let mtime = 0;
        try { mtime = fs.statSync(full).mtimeMs; } catch (e) {}
        return { f, mtime };
      })
      .sort((a, b) => a.mtime - b.mtime);

    for (const entry of entries.slice(0, entries.length - max)) {
      const base = path.join(dir, entry.f.replace(/\.json$/, ''));
      try { fs.unlinkSync(base + '.json'); } catch (e) {}
      try { fs.unlinkSync(base + '.bin'); } catch (e) {}
    }
  } catch (e) {}
}

function saveStoredMedia(chatId, id, data) {
  if (!chatId || !id || !data || !data.buffer) return;
  if (!mediaStore.has(chatId)) mediaStore.set(chatId, new Map());
  const store = mediaStore.get(chatId);
  store.set(id, data);

  if (store.size > MAX_MEDIA) {
    const firstKey = store.keys().next().value;
    store.delete(firstKey);
  }

  try {
    const p = vvPaths(chatId, id);
    ensureDir(p.dir);
    fs.writeFileSync(p.bin, data.buffer);
    fs.writeFileSync(p.meta, JSON.stringify({
      chatId,
      id,
      type: data.type,
      mimetype: data.mimetype || null,
      caption: data.caption || '',
      ptt: !!data.ptt,
      savedAt: Date.now()
    }));
    pruneDir(p.dir, MAX_MEDIA_PER_CHAT);
  } catch (e) {
    console.error('[VV] sauvegarde impossible :', e.message);
  }
}

function loadStoredMedia(chatId, id) {
  try {
    const p = vvPaths(chatId, id);
    if (!fs.existsSync(p.meta) || !fs.existsSync(p.bin)) return null;
    const meta = JSON.parse(fs.readFileSync(p.meta, 'utf8'));
    const buffer = fs.readFileSync(p.bin);
    if (!buffer || !buffer.length) return null;
    return {
      buffer,
      type: meta.type,
      mimetype: meta.mimetype,
      caption: meta.caption || '',
      ptt: !!meta.ptt
    };
  } catch (e) {
    return null;
  }
}

function cacheMessage(msg) {
  if (!msg.message || !msg.key) return;
  const chatId = msg.key.remoteJid;
  if (!chatId) return;

  if (!messageCache.has(chatId)) {
    messageCache.set(chatId, new Map());
  }
  const chatCache = messageCache.get(chatId);
  chatCache.set(msg.key.id, msg);

  if (chatCache.size > MAX_CACHE) {
    const firstKey = chatCache.keys().next().value;
    chatCache.delete(firstKey);
  }
}

async function handleAntiDelete(sock, updates) {
  for (const update of updates) {
    const isRevoke = update.update?.messageStubType === 1 ||
                     update.update?.message?.protocolMessage?.type === 0;
    if (!isRevoke) continue;

    const deletedKey = update.key;
    if (!deletedKey || !deletedKey.id) continue;

    const chatId = deletedKey.remoteJid;
    const chatCache = messageCache.get(chatId);
    if (!chatCache) continue;

    const originalMsg = chatCache.get(deletedKey.id);
    if (!originalMsg) continue;

    // cle unifiee : antidelete_<chat> (active par defaut), compat avec ancien protection_<chat>.antidelete
    const settings = db.getSetting(`protection_${chatId}`, {});
    const enabled = db.getSetting(`antidelete_${chatId}`, settings.antidelete !== false);
    if (!enabled) continue;

    // Si la suppression a ete faite par un administrateur, on ne recupere pas le message.
    const deleterJid = update.update?.key?.participant || update.update?.key?.remoteJid;
    try {
      const meta = await getGroupMeta(sock, chatId);
      if (isAdmin(meta, deleterJid)) continue;
    } catch (e) { /* en cas d'erreur, on recupere par securite */ }

    try {
      const sender = originalMsg.key.participant || originalMsg.key.remoteJid;
      let meta = null;
      try { meta = await getGroupMeta(sock, chatId); } catch (e) {}
      const label = pretty(phoneOf(sock, meta, sender) || sender);
      const caption = `🚫 *ANTI-DELETE*\n\n` +
                      `👤 Auteur : ${label}\n` +
                      `📝 Message supprimé :\n\n`;

      const text = originalMsg.message.conversation ||
                   originalMsg.message.extendedTextMessage?.text ||
                   originalMsg.message.imageMessage?.caption ||
                   originalMsg.message.videoMessage?.caption;

      if (text) {
        await sock.sendMessage(chatId, {
          text: caption + `"${text}"`,
          mentions: [sender]
        });
      } else if (originalMsg.message.imageMessage || originalMsg.message.videoMessage || originalMsg.message.stickerMessage) {
        const buffer = await downloadMediaMessage(originalMsg, 'buffer', {});
        const type = originalMsg.message.imageMessage ? 'image' :
                     originalMsg.message.videoMessage ? 'video' : 'sticker';

        await sock.sendMessage(chatId, {
          [type]: buffer,
          caption: type !== 'sticker' ? caption : undefined,
          mentions: [sender]
        });
      }
    } catch (e) {
      console.error('[ANTIDELETE] Erreur envoi :', e.message);
    }
  }
}

function getCachedMessage(chatId, id) {
  const chatCache = messageCache.get(chatId);
  if (!chatCache) return null;
  return chatCache.get(id) || null;
}

function hasDownloadKeys(media) {
  if (!media || typeof media !== 'object') return false;
  const key = media.mediaKey;
  const location = media.directPath || media.url;
  return !!(key && key.length && location);
}

function isZeroHash(value) {
  if (!value) return true;
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buf.length === 0 || buf.every((b) => b === 0);
}

function describeMedia(messageOrContent) {
  const raw = messageOrContent && messageOrContent.message
    ? messageOrContent.message
    : messageOrContent;
  const content = extractMessageContent(raw) || {};
  const type = content.imageMessage ? 'image'
    : content.videoMessage ? 'video'
    : content.audioMessage ? 'audio'
    : content.documentMessage ? 'document'
    : null;
  if (!type) return { type: null, media: null, hasMediaKey: false, hasDirectPath: false, zeroHash: true };
  const media = content[type + 'Message'] || content.documentMessage || null;
  return {
    type,
    media,
    hasMediaKey: !!(media && media.mediaKey && media.mediaKey.length),
    hasDirectPath: !!(media && (media.directPath || media.url)),
    zeroHash: isZeroHash(media && media.fileSha256)
  };
}

async function captureViewOnce(sock, m) {
  if (!m || !m.message || !m.key) return null;
  const msg = m.message;
  const isViewOnce =
    msg.viewOnceMessageV2 || msg.viewOnceMessageV2Extension ||
    msg.viewOnceMessage || msg.imageMessage?.viewOnce ||
    msg.videoMessage?.viewOnce || msg.audioMessage?.viewOnce ||
    m.key.isViewOnce;
  if (!isViewOnce) return null;

  const chatId = m.key.remoteJid;
  const id = m.key.id;
  if (!chatId || !id) return null;

  const existing = getStoredMedia(chatId, id);
  if (existing) return existing;

  const info = describeMedia(m);
  if (!info.type || !info.media) return null;

  // Media masque par WhatsApp (appareil lie) : aucune cle, aucun chemin.
  if (!hasDownloadKeys(info.media)) return null;

  try {
    const buffer = await downloadMediaMessage(m, 'buffer', {}, {
      reuploadRequest: sock && typeof sock.updateMediaMessage === 'function'
        ? (target) => sock.updateMediaMessage(target)
        : undefined
    });
    if (!buffer || !buffer.length) return null;

    const data = {
      buffer,
      type: info.type,
      mimetype: info.media.mimetype,
      caption: info.media.caption || info.media.fileName || '',
      ptt: !!info.media.ptt
    };
    saveStoredMedia(chatId, id, data);
    return data;
  } catch (e) {
    return null;
  }
}

function getStoredMedia(chatId, id) {
  const store = mediaStore.get(chatId);
  if (store && store.get(id)) return store.get(id);

  const disk = loadStoredMedia(chatId, id);
  if (disk) {
    if (!mediaStore.has(chatId)) mediaStore.set(chatId, new Map());
    mediaStore.get(chatId).set(id, disk);
    return disk;
  }
  return null;
}

module.exports = {
  cacheMessage,
  handleAntiDelete,
  getCachedMessage,
  messageCache,
  captureViewOnce,
  getStoredMedia,
  describeMedia,
  hasDownloadKeys,
  isZeroHash
};
