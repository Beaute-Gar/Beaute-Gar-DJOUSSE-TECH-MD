'use strict';
const style = require('../../config/style');

let cachedVoice = process.env.ELEVENLABS_VOICE_ID || null;

async function resolveVoice(key) {
  if (cachedVoice) return cachedVoice;

  const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } });
  const data = await res.json();
  if (!res.ok) {
    const detail = data && data.detail;
    throw new Error((detail && (detail.message || detail)) || ('HTTP ' + res.status));
  }
  const first = data && data.voices && data.voices[0];
  if (!first) throw new Error('aucune voix disponible');
  cachedVoice = first.voice_id;
  return cachedVoice;
}

module.exports = {
  name: 'voice',
  aliases: ['tts', 'say'],
  category: 'sticker-media',
  description: 'Transforme un texte en vocal (ElevenLabs)',
  async execute(sock, m, from, args) {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return sock.sendMessage(from, { text: style.renderError(['Cle ElevenLabs absente dans .env.']) });

    const text = args.join(' ').trim();
    if (!text) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .voice <texte a dire>']) });
    if (text.length > 600) {
      return sock.sendMessage(from, { text: style.renderError(['Texte trop long (600 caracteres maximum).']) });
    }

    try {
      await sock.sendPresenceUpdate('composing', from);

      const id = await resolveVoice(key);
      const res = await fetch(
        'https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(id) + '?output_format=mp3_44100_128',
        {
          method: 'POST',
          headers: {
            'xi-api-key': key,
            'content-type': 'application/json',
            accept: 'audio/mpeg'
          },
          body: JSON.stringify({
            text,
            model_id: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 }
          })
        }
      );

      if (!res.ok) {
        let detail = 'HTTP ' + res.status;
        try {
          const data = await res.json();
          detail = (data.detail && (data.detail.message || data.detail)) || detail;
        } catch (e) {}
        throw new Error(detail);
      }

      const audio = Buffer.from(await res.arrayBuffer());
      if (!audio.length) throw new Error('audio vide');

      await sock.sendMessage(from, { audio, mimetype: 'audio/mpeg', fileName: 'voice.mp3' });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError(['Erreur vocale : ' + e.message]) });
    }
  }
};
