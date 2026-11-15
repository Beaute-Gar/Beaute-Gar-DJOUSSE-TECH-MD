'use strict';
const db = require('../lib/database');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const {
  getStoredMedia,
  describeMedia,
  hasDownloadKeys
} = require('./antidelete-handler');

async function handleAutoViewOnce(sock, m) {
  const msg = m?.message;
  if (!msg) return;

  const isViewOnce =
    msg.viewOnceMessageV2 ||
    msg.viewOnceMessageV2Extension ||
    msg.viewOnceMessage ||
    msg.imageMessage?.viewOnce ||
    msg.videoMessage?.viewOnce ||
    msg.audioMessage?.viewOnce ||
    m.key?.isViewOnce;

  if (!isViewOnce) return;

  const from = m.key.remoteJid;
  if (!from) return;

  // Auto-vv active par defaut, desactivable par chat avec .vv auto off
  const isEnabled = db.getSetting('vv_auto_' + from) !== false;
  if (!isEnabled) return;

  const info = describeMedia(m);
  if (!info.type || !info.media) return;

  let buffer = null;
  const stored = getStoredMedia(from, m.key.id);
  if (stored && stored.buffer) {
    buffer = stored.buffer;
  }

  if (!buffer) {
    // Media masque par WhatsApp : inutile d'essayer de telecharger.
    if (!hasDownloadKeys(info.media)) return;
    try {
      buffer = await downloadMediaMessage(m, 'buffer', {}, {
        reuploadRequest: typeof sock.updateMediaMessage === 'function'
          ? (target) => sock.updateMediaMessage(target)
          : undefined
      });
    } catch (e) {
      return;
    }
  }

  if (!buffer || !buffer.length) return;

  const type = info.type;
  const mimetype = info.media.mimetype;
  const caption = info.media.caption || '';
  const payload = { mimetype };

  if (type === 'document') {
    payload.document = buffer;
    payload.fileName = info.media.fileName || 'fichier';
  } else {
    payload[type] = buffer;
    if (type !== 'audio') {
      payload.caption = caption
        ? caption + '\n\n📥 Vue unique interceptée'
        : '📥 Vue unique interceptée';
    } else {
      payload.ptt = !!(stored && stored.ptt) || !!info.media.ptt;
    }
  }

  try {
    await sock.sendMessage(from, payload, { quoted: m });
  } catch (e) {
    console.error('[AUTO-VV] Erreur:', e.message);
  }
}

module.exports = { handleAutoViewOnce };
