'use strict';

const style = require('../../config/style');
const db = require('../../lib/database');
const config = require('../../config/config');
const {
  downloadMediaMessage,
  extractMessageContent
} = require('@whiskeysockets/baileys');
const {
  getStoredMedia,
  getCachedMessage
} = require('../../handlers/antidelete-handler');

// Interrupteur memoire (compatibilite avec l'ancien code)
if (typeof global.antivvEnabled === 'undefined') {
  global.antivvEnabled = config.ANTIVV !== false;
}

function quotedFrom(message) {
  return message.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
}

function mediaFrom(messageOrContent) {
  const raw = messageOrContent && messageOrContent.message
    ? messageOrContent.message
    : messageOrContent;
  const content = extractMessageContent(raw) || {};
  const type = content.imageMessage ? 'image'
    : content.videoMessage ? 'video'
    : content.audioMessage ? 'audio'
    : content.documentMessage ? 'document'
    : null;
  if (!type) return null;
  const media = content[type + 'Message'] || content.documentMessage || null;
  if (!media) return null;
  return { type, media };
}

function hasDownloadKeys(media) {
  if (!media || typeof media !== 'object') return false;
  return !!(media.mediaKey && media.mediaKey.length && (media.directPath || media.url));
}

function describeMedia(messageOrContent) {
  const info = mediaFrom(messageOrContent);
  if (!info) {
    return { type: null, media: null, hasMediaKey: false, hasDirectPath: false, zeroHash: true };
  }
  const media = info.media;
  return {
    type: info.type,
    media,
    hasMediaKey: !!(media.mediaKey && media.mediaKey.length),
    hasDirectPath: !!(media.directPath || media.url),
    zeroHash: !media.fileSha256 || Buffer.from(media.fileSha256).every((b) => b === 0)
  };
}

function defaultMime(type) {
  if (type === 'image') return 'image/jpeg';
  if (type === 'video') return 'video/mp4';
  if (type === 'audio') return 'audio/mp4';
  return 'application/octet-stream';
}

function redactedText(extra = []) {
  return style.box('VUE UNIQUE', [
    'WhatsApp a masqué ce média côté serveur.',
    'Le lien et la clé de déchiffrement ne sont pas envoyés aux appareils liés (web/API).',
    'Les champs manquants (mediaKey, directPath) sont des secrets cryptographiques : ils ne peuvent pas être générés par le bot.',
    'Solution : demande à l’expéditeur de renvoyer le média sans « vue unique ».',
    ...extra
  ]);
}

function infoText() {
  return style.box('VUE UNIQUE', [
    'Réponds à une photo, vidéo ou audio « vue unique » avec .vv.',
    'Le bot tente d’abord le média capturé à l’arrivée, puis le message original en cache, puis le message cité.',
    'Limite WhatsApp : les appareils liés (web/API) reçoivent souvent un média masqué sans clé. Dans ce cas, la récupération est impossible côté bot.',
    'Auto : .vv auto on|off.'
  ]);
}

async function reply(sock, message, sender, text) {
  return sock.sendMessage(sender, { text }, { quoted: message });
}

async function handleAuto(sock, message, sender, args) {
  const current = db.getSetting('vv_auto_' + sender) !== false;
  const action = String(args[1] || '').toLowerCase();

  if (!action) {
    return reply(sock, message, sender, style.renderInfo([
      `Auto-vue unique : ${current ? 'ON' : 'OFF'}`,
      'Utilise .vv auto on ou .vv auto off.'
    ]));
  }

  if (!['on', 'off', 'oui', 'non'].includes(action)) {
    return reply(sock, message, sender, style.renderInfo(['Usage : .vv auto on|off']));
  }

  const enabled = action === 'on' || action === 'oui';
  db.setSetting('vv_auto_' + sender, enabled);
  return reply(sock, message, sender, style.renderSuccess([
    `Auto-vue unique : ${enabled ? 'ON' : 'OFF'}`
  ]));
}

async function downloadWithRetry(sock, target, info) {
  if (!info || !info.media || !hasDownloadKeys(info.media)) return null;

  try {
    return await downloadMediaMessage(target, 'buffer', {}, {
      reuploadRequest: typeof sock.updateMediaMessage === 'function'
        ? (msg) => sock.updateMediaMessage(msg)
        : undefined
    });
  } catch (e) {
    // URL expiree : on demande au telephone de re-uploader le media.
    if (typeof sock.updateMediaMessage === 'function') {
      try {
        const updated = await sock.updateMediaMessage(target);
        return await downloadMediaMessage(updated, 'buffer', {});
      } catch (_) {}
    }
    return null;
  }
}

module.exports = {
  commands: ['vv', 'viewonce'],
  description: 'Récupère une photo, vidéo ou audio en vue unique',
  permission: 'owner',
  group: true,
  private: true,

  name: 'vv',
  aliases: ['viewonce'],
  category: 'sticker-media',

  async execute(sock, m, from, args) {
    const contextInfo = m.message?.extendedTextMessage?.contextInfo
      || m.message?.imageMessage?.contextInfo
      || m.message?.videoMessage?.contextInfo
      || m.message?.documentMessage?.contextInfo
      || null;
    return this.run(sock, m, args, { sender: from, contextInfo });
  },

  run: async (sock, message, args = [], { sender, contextInfo }) => {
    const a = (args || []).map((x) => String(x).toLowerCase());

    if (a[0] === 'auto') return handleAuto(sock, message, sender, a);
    if (a[0] === 'info' || a[0] === 'aide' || a[0] === 'help') {
      return reply(sock, message, sender, infoText());
    }

    const quoted = contextInfo?.quotedMessage || quotedFrom(message);
    if (!quoted) {
      return reply(sock, message, sender, style.renderInfo([
        'Réponds à un message « vue unique » avec .vv.'
      ]));
    }

    const ctx = contextInfo || message.message?.extendedTextMessage?.contextInfo || {};
    const stanzaId = ctx.stanzaId || null;
    const chatId = message.key.remoteJid;

    let buffer = null;
    let type = null;
    let mimetype = null;
    let caption = '';
    let ptt = false;
    let lastErr = null;

    // 1) Media deja capture a l'arrivee (memoire ou disque)
    if (stanzaId) {
      const stored = getStoredMedia(chatId, stanzaId);
      if (stored && stored.buffer) {
        buffer = stored.buffer;
        type = stored.type;
        mimetype = stored.mimetype;
        caption = stored.caption || '';
        ptt = !!stored.ptt;
      }
    }

    // 2) Message original en cache (le quote n'est souvent qu'un stub)
    if (!buffer && stanzaId) {
      const cached = getCachedMessage(chatId, stanzaId);
      if (cached) {
        const info = describeMedia(cached);
        if (info.type) {
          type = info.type;
          mimetype = info.media?.mimetype;
          caption = info.media?.caption || info.media?.fileName || '';
          ptt = !!info.media?.ptt;
          buffer = await downloadWithRetry(sock, cached, info);
          if (!buffer && !hasDownloadKeys(info.media)) {
            lastErr = new Error('média masqué par WhatsApp');
          }
        }
      }
    }

    // 3) Message cite (si WhatsApp a livre le media complet)
    const quotedInfo = mediaFrom(quoted);
    if (!buffer && quotedInfo) {
      const info = quotedInfo;
      type = info.type;
      mimetype = info.media?.mimetype;
      caption = info.media?.caption || info.media?.fileName || '';
      ptt = !!info.media?.ptt;
      const target = {
        message: quoted,
        key: { ...message.key, id: stanzaId || message.key.id }
      };
      buffer = await downloadWithRetry(sock, target, info);
      if (!buffer && !hasDownloadKeys(info.media)) {
        lastErr = new Error('média masqué par WhatsApp');
      }
    }

    // 4) Derniere tentative : demander au telephone principal de renvoyer le message.
    // Utile quand le média est un placeholder : le téléphone peut renvoyer le contenu complet.
    let pdoRequested = false;
    if (!buffer && stanzaId && quotedInfo && typeof sock.requestPlaceholderResend === 'function') {
      let liveMessage = null;
      const onUpsert = (event) => {
        for (const msg of event?.messages || []) {
          if (msg?.key?.id === stanzaId) {
            liveMessage = msg;
            break;
          }
        }
      };
      if (sock.ev && typeof sock.ev.on === 'function') {
        try { sock.ev.on('messages.upsert', onUpsert); } catch (e) {}
      }

      try {
        const key = {
          remoteJid: chatId,
          fromMe: false,
          id: stanzaId,
          participant: ctx.participant
        };
        const requestId = await sock.requestPlaceholderResend(key, { key });
        pdoRequested = true;
        const deadline = Date.now() + (requestId === 'RESOLVED' ? 2000 : 6000);

        while (Date.now() < deadline && !buffer) {
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Le telephone principal a renvoye le message : on le traite directement.
          if (liveMessage) {
            const info = describeMedia(liveMessage);
            if (info.type && hasDownloadKeys(info.media)) {
              const downloaded = await downloadWithRetry(sock, liveMessage, info);
              if (downloaded) {
                buffer = downloaded;
                type = info.type;
                mimetype = info.media.mimetype;
                caption = info.media.caption || info.media.fileName || '';
                ptt = !!info.media.ptt;
                break;
              }
            }
          }

          const stored = getStoredMedia(chatId, stanzaId);
          if (stored && stored.buffer) {
            buffer = stored.buffer;
            type = stored.type;
            mimetype = stored.mimetype;
            caption = stored.caption || '';
            ptt = !!stored.ptt;
            break;
          }

          const cached = getCachedMessage(chatId, stanzaId);
          if (cached) {
            const info = describeMedia(cached);
            if (info.type && hasDownloadKeys(info.media)) {
              const downloaded = await downloadWithRetry(sock, cached, info);
              if (downloaded) {
                buffer = downloaded;
                type = info.type;
                mimetype = info.media.mimetype;
                caption = info.media.caption || info.media.fileName || '';
                ptt = !!info.media.ptt;
                break;
              }
            }
          }
        }
      } catch (e) {
      } finally {
        if (sock.ev && typeof sock.ev.off === 'function') {
          try { sock.ev.off('messages.upsert', onUpsert); } catch (e) {}
        }
      }
    }

    if (buffer) {
      console.error(`[VV] média récupéré : ${type} (${buffer.length} octets)`);
      const sendCaption = caption
        ? `${caption}\n\n👁️ Vue unique récupérée`
        : '👁️ Vue unique récupérée';

      if (type === 'image') {
        await sock.sendMessage(sender, {
          image: buffer,
          caption: sendCaption,
          mimetype: mimetype || defaultMime(type)
        }, { quoted: message });
      } else if (type === 'video') {
        await sock.sendMessage(sender, {
          video: buffer,
          caption: sendCaption,
          mimetype: mimetype || defaultMime(type)
        }, { quoted: message });
      } else if (type === 'audio') {
        await sock.sendMessage(sender, {
          audio: buffer,
          mimetype: mimetype || defaultMime(type),
          ptt
        }, { quoted: message });
      } else if (type === 'document') {
        await sock.sendMessage(sender, {
          document: buffer,
          fileName: caption || 'fichier',
          mimetype: mimetype || defaultMime(type)
        }, { quoted: message });
      }

      try {
        await sock.sendMessage(sender, { react: { text: '😍', key: message.key } });
      } catch (e) {}
      return;
    }

    // Diagnostic : media masque ou erreur de telechargement
    const info = describeMedia({ message: quoted });
    if (!info.type) {
      return reply(sock, message, sender, style.renderInfo([
        'Ce message ne contient pas d’image, de vidéo ou d’audio.'
      ]));
    }

    const redacted = !!(info && info.type && (
      !info.hasMediaKey || !info.hasDirectPath || info.zeroHash
    ));

    try {
      await sock.sendMessage(sender, { react: { text: '😔', key: message.key } });
    } catch (e) {}

    if (redacted) {
      console.error('[VV] média masqué :', {
        type: info.type,
        hasMediaKey: info.hasMediaKey,
        hasDirectPath: info.hasDirectPath,
        zeroHash: info.zeroHash,
        pdoRequested
      });
      return reply(sock, message, sender, redactedText(
        pdoRequested
          ? ['Le bot a demandé au téléphone principal de renvoyer le média, sans succès.']
          : []
      ));
    }

    return reply(sock, message, sender, style.renderError([
      'Impossible de récupérer ce média.',
      lastErr?.message ? `Détail : ${lastErr.message}` : 'Réessaie en répondant au message d’origine.',
      'Si le média a été ouvert sur un autre appareil, WhatsApp le supprime définitivement.'
    ]));
  }
};
