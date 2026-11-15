'use strict';
const style = require('../../config/style');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

// Image directe ou image citee (reponse a un message).
function findImage(m) {
  const msg = m.message || {};
  const info = msg.extendedTextMessage && msg.extendedTextMessage.contextInfo;
  const quoted = (info && info.quotedMessage) || {};

  if (msg.imageMessage) return { message: msg, key: m.key };
  if (quoted.imageMessage && info && info.stanzaId) {
    return { message: quoted, key: { ...m.key, id: info.stanzaId } };
  }
  return null;
}

module.exports = {
  name: 'removebg',
  aliases: ['remove-bg', 'detourer'],
  category: 'sticker-media',
  description: 'Supprime le fond d\'une image (Remove.bg)',
  async execute(sock, m, from) {
    const key = process.env.REMOVEBG_API_KEY;
    if (!key) return sock.sendMessage(from, { text: style.renderError(['Cle Remove.bg absente dans .env.']) });

    const target = findImage(m);
    if (!target) {
      return sock.sendMessage(from, {
        text: style.renderInfo([
          'Repondez a une image avec .removebg',
          'Ou envoyez l\'image avec la legende .removebg'
        ])
      });
    }

    await sock.sendMessage(from, { text: style.renderInfo(['Suppression du fond en cours...']) });

    try {
      const buffer = await downloadMediaMessage(target, 'buffer', {});
      if (!buffer || !buffer.length) throw new Error('image vide ou introuvable');

      const form = new FormData();
      form.append('image_file', new Blob([buffer], { type: 'image/jpeg' }), 'image.jpg');
      form.append('size', 'auto');

      const res = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: { 'X-Api-Key': key },
        body: form
      });

      if (!res.ok) {
        let detail = 'HTTP ' + res.status;
        try {
          const data = await res.json();
          detail = (data.errors && data.errors[0] && data.errors[0].title) || detail;
        } catch (e) {}
        throw new Error(detail);
      }

      const out = Buffer.from(await res.arrayBuffer());
      if (!out.length) throw new Error('image resultat vide');

      await sock.sendMessage(from, { image: out, caption: style.renderSuccess(['Fond supprime.']) });
    } catch (e) {
      const hint = /credit|quota|402|payment/i.test(e.message)
        ? 'Credits Remove.bg epuises.'
        : e.message;
      await sock.sendMessage(from, { text: style.renderError(['Erreur Remove.bg : ' + hint]) });
    }
  }
};
