'use strict';
const style = require('../../config/style');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { imageToSticker, videoToSticker } = require('../../lib/sticker');

// Trouve le media a convertir : message direct ou message cite.
function findMedia(m) {
  const msg = m.message || {};
  const quotedInfo = msg.extendedTextMessage?.contextInfo;
  const quoted = quotedInfo?.quotedMessage || {};

  if (msg.imageMessage) {
    return { kind: 'image', source: m };
  }
  if (msg.videoMessage) {
    return { kind: 'video', source: m };
  }
  if (msg.stickerMessage || quoted.stickerMessage) {
    return { kind: 'sticker' };
  }
  if (quoted.imageMessage && quotedInfo?.stanzaId) {
    return {
      kind: 'image',
      source: { message: quoted, key: { ...m.key, id: quotedInfo.stanzaId } }
    };
  }
  if (quoted.videoMessage && quotedInfo?.stanzaId) {
    return {
      kind: 'video',
      source: { message: quoted, key: { ...m.key, id: quotedInfo.stanzaId } }
    };
  }

  return null;
}

module.exports = {
  name: 'sticker',
  aliases: ['s', 'stiker'],
  category: 'sticker-media',
  description: 'Convertit une image, un GIF ou une video en sticker',
  async execute(sock, m, from) {
    const media = findMedia(m);

    if (!media) {
      return sock.sendMessage(from, {
        text: style.renderInfo([
          'Repondez a une image ou une video avec .sticker',
          'Ou envoyez le media avec la legende .sticker'
        ])
      });
    }

    if (media.kind === 'sticker') {
      return sock.sendMessage(from, {
        text: style.renderInfo(['C\'est deja un sticker.', 'Pour changer son auteur : .take <nom>'])
      });
    }

    try {
      const buffer = await downloadMediaMessage(media.source, 'buffer', {});
      if (!buffer || !buffer.length) {
        throw new Error('media vide ou introuvable');
      }

      const webp = media.kind === 'video'
        ? await videoToSticker(buffer)
        : await imageToSticker(buffer);

      await sock.sendMessage(from, { sticker: webp });
    } catch (e) {
      const hint = media.kind === 'video'
        ? 'Verifie que la video dure moins de 6 secondes.'
        : 'Essaie avec une autre image.';
      await sock.sendMessage(from, {
        text: style.renderError([`Erreur sticker : ${e.message}`, hint])
      });
    }
  }
};
