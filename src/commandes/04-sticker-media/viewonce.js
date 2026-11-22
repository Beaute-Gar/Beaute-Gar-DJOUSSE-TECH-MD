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

// Compatibilite avec l'ancien systeme antivv.
if (typeof global.antivvEnabled === 'undefined') {
  global.antivvEnabled = config.ANTIVV !== false;
}

function normalizeJid(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (raw.includes('@')) return raw;
  return raw.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
}

function getBotNumber(sock) {
  const id = sock.user?.id || '';
  return normalizeJid(id.split(':')[0]);
}

function getOwnerNumber() {
  return normalizeJid(config.OWNER_NUMBER);
}

function getQuotedMessage(message, contextInfo) {
  return contextInfo?.quotedMessage
    || message.message?.extendedTextMessage?.contextInfo?.quotedMessage
    || message.message?.imageMessage?.contextInfo?.quotedMessage
    || message.message?.videoMessage?.contextInfo?.quotedMessage
    || message.message?.documentMessage?.contextInfo?.quotedMessage
    || null;
}

function unwrapViewOnce(content) {
  let current = content || {};

  for (let i = 0; i < 4; i += 1) {
    if (current.viewOnceMessageV2?.message) {
      current = current.viewOnceMessageV2.message;
    } else if (current.viewOnceMessage?.message) {
      current = current.viewOnceMessage.message;
    } else if (current.viewOnceMessageV2Extension?.message) {
      current = current.viewOnceMessageV2Extension.message;
    } else {
      break;
    }
  }

  return extractMessageContent(current) || current;
}

function mediaFrom(messageOrContent) {
  const raw = messageOrContent?.message
    ? messageOrContent.message
    : messageOrContent;

  const content = unwrapViewOnce(raw);

  const type = content.imageMessage ? 'image'
    : content.videoMessage ? 'video'
    : content.audioMessage ? 'audio'
    : content.documentMessage ? 'document'
    : null;

  if (!type) return null;

  return {
    type,
    media: content[type + 'Message'] || null
  };
}

function hasDownloadKeys(media) {
  return !!(
    media
    && media.mediaKey
    && media.mediaKey.length
    && (media.directPath || media.url)
  );
}

function defaultMime(type) {
  if (type === 'image') return 'image/jpeg';
  if (type === 'video') return 'video/mp4';
  if (type === 'audio') return 'audio/ogg';
  return 'application/octet-stream';
}

async function reply(sock, message, chat, text) {
  return sock.sendMessage(chat, { text }, { quoted: message });
}

async function downloadMedia(sock, target) {
  if (!target) return null;

  try {
    return await downloadMediaMessage(target, 'buffer', {}, {
      reuploadRequest: typeof sock.updateMediaMessage === 'function'
        ? (msg) => sock.updateMediaMessage(msg)
        : undefined
    });
  } catch (error) {
    if (typeof sock.updateMediaMessage === 'function') {
      try {
        const updated = await sock.updateMediaMessage(target);
        return await downloadMediaMessage(updated, 'buffer', {});
      } catch (_) {}
    }

    return null;
  }
}

async function handleAuto(sock, message, chat, args) {
  const current = db.getSetting('vv_auto_' + chat) !== false;
  const action = String(args[1] || '').toLowerCase();

  if (!action) {
    return reply(sock, message, chat, style.renderInfo([
      `Auto-vue unique : ${current ? 'ON' : 'OFF'}`,
      'Utilisation : .vv auto on ou .vv auto off'
    ]));
  }

  if (!['on', 'off', 'oui', 'non'].includes(action)) {
    return reply(sock, message, chat, style.renderError([
      'Commande invalide.',
      'Utilisation : .vv auto on|off'
    ]));
  }

  const enabled = action === 'on' || action === 'oui';
  db.setSetting('vv_auto_' + chat, enabled);

  return reply(sock, message, chat, style.renderSuccess([
    `Auto-vue unique : ${enabled ? 'ON' : 'OFF'}`
  ]));
}

module.exports = {
  commands: ['vv', 'vv2', 'vv3', 'viewonce'],
  description: 'Récupère un média envoyé en vue unique',
  permission: 'owner',
  group: true,
  private: true,

  name: 'vv',
  aliases: ['viewonce', 'vv2', 'vv3'],
  category: 'sticker-media',

  async execute(sock, m, from, args = []) {
    const contextInfo = m.message?.extendedTextMessage?.contextInfo
      || m.message?.imageMessage?.contextInfo
      || m.message?.videoMessage?.contextInfo
      || m.message?.audioMessage?.contextInfo
      || m.message?.documentMessage?.contextInfo
      || null;

    return this.run(sock, m, args, {
      sender: from || m.key?.remoteJid,
      contextInfo
    });
  },

  async run(sock, message, args = [], options = {}) {
    const chat = options.sender || message.key?.remoteJid;
    const contextInfo = options.contextInfo
      || message.message?.extendedTextMessage?.contextInfo
      || {};

    const prefix = config.PREFIX || '.';
    const rawArgs = Array.isArray(args) ? args : [];

    const command = String(rawArgs.command || rawArgs[0] || '')
      .replace(prefix, '')
      .toLowerCase();

    const body = String(message.body || message.text || '');

    const detectedCommand = body.startsWith(prefix)
      ? body.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase()
      : '';

    const cmd = ['vv', 'vv2', 'vv3', 'viewonce'].includes(command)
      ? (command === 'viewonce' ? 'vv' : command)
      : (detectedCommand === 'viewonce' ? 'vv' : detectedCommand);

    if (!['vv', 'vv2', 'vv3'].includes(cmd)) return;

    const botNumber = getBotNumber(sock);
    const ownerNumber = getOwnerNumber();

    const actor = normalizeJid(
      message.key?.participant
      || message.participant
      || (message.key?.fromMe ? botNumber : '')
      || ''
    );

    const isOwner = actor === ownerNumber;
    const isBot = !!message.key?.fromMe || actor === botNumber;

    if (!isOwner && !isBot) {
      return reply(sock, message, chat, style.renderError([
        'Accès refusé.',
        'Cette commande est réservée au propriétaire du bot.'
      ]));
    }

    if (rawArgs[0] && String(rawArgs[0]).toLowerCase() === 'auto') {
      return handleAuto(sock, message, chat, rawArgs);
    }

    const quoted = getQuotedMessage(message, contextInfo);

    if (!quoted) {
      return reply(sock, message, chat, style.renderInfo([
        'Réponds directement à une photo, vidéo ou audio en vue unique.',
        `Commande : ${prefix}${cmd}`
      ]));
    }

    const content = unwrapViewOnce(quoted);
    const mediaInfo = mediaFrom(content);

    if (!mediaInfo) {
      return reply(sock, message, chat, style.renderError([
        'Ce message ne contient pas de média compatible.',
        'Formats pris en charge : image, vidéo, audio et document.'
      ]));
    }

    const stanzaId = contextInfo.stanzaId || null;
    const remoteJid = message.key?.remoteJid || chat;

    let buffer = null;
    let media = mediaInfo.media;
    let type = mediaInfo.type;

    // 1. Recherche du média dans le cache anti-suppression.
    if (stanzaId) {
      const stored = getStoredMedia(remoteJid, stanzaId);

      if (stored?.buffer) {
        buffer = stored.buffer;
        type = stored.type || type;

        media = {
          ...media,
          mimetype: stored.mimetype || media?.mimetype,
          caption: stored.caption || media?.caption,
          ptt: stored.ptt ?? media?.ptt
        };
      }
    }

    // 2. Recherche du message original dans le cache.
    if (!buffer && stanzaId) {
      const cached = getCachedMessage(remoteJid, stanzaId);

      if (cached) {
        const cachedInfo = mediaFrom(cached);

        if (cachedInfo?.media) {
          type = cachedInfo.type;
          media = cachedInfo.media;

          if (hasDownloadKeys(media)) {
            buffer = await downloadMedia(sock, cached);
          }
        }
      }
    }

    // 3. Tentative de téléchargement du média cité.
    if (!buffer && hasDownloadKeys(media)) {
      const target = {
        key: {
          ...message.key,
          remoteJid,
          id: stanzaId || message.key?.id
        },
        message: content
      };

      buffer = await downloadMedia(sock, target);
    }

    if (!buffer) {
      return reply(sock, message, chat, style.renderError([
        'Impossible de récupérer ce média en vue unique.',
      ]));
    }

    const caption = '_DOWNLOAD VIEW ONCE BY DJOUSSE-TECH_';

    let recipient = chat;

    if (cmd === 'vv2') recipient = botNumber;
    if (cmd === 'vv3') recipient = ownerNumber;

    if (!recipient) {
      return reply(sock, message, chat, style.renderError([
        'Destinataire introuvable. Vérifie la configuration du propriétaire.'
      ]));
    }

    try {
      if (type === 'image') {
        await sock.sendMessage(recipient, {
          image: buffer,
          caption,
          mimetype: media?.mimetype || defaultMime(type)
        });

      } else if (type === 'video') {
        await sock.sendMessage(recipient, {
          video: buffer,
          caption,
          mimetype: media?.mimetype || defaultMime(type)
        });

      } else if (type === 'audio') {
        await sock.sendMessage(recipient, {
          audio: buffer,
          mimetype: media?.mimetype || defaultMime(type),
          ptt: !!media?.ptt
        });

      } else if (type === 'document') {
        await sock.sendMessage(recipient, {
          document: buffer,
          fileName: media?.fileName || 'media',
          mimetype: media?.mimetype || defaultMime(type),
          caption
        });

      } else {
        return reply(sock, message, chat, style.renderError([
          'Type de média non pris en charge.'
        ]));
      }

      try {
        await sock.sendMessage(chat, {
          react: { text: '✅', key: message.key }
        });
      } catch (_) {}

      console.log(
        `[VV] média envoyé par ${cmd} vers ${recipient} (${type}, ${buffer.length} octets)`
      );

    } catch (error) {
      console.error('[VV] Erreur lors de l’envoi :', error);

      return reply(sock, message, chat, style.renderError([
        'Le média a été récupéré, mais son envoi a échoué.',
        'Vérifie la connexion WhatsApp et réessaie.'
      ]));
    }
  }
};