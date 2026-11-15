'use strict';
const style = require('../../config/style');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const LANGS = {
  fr: 'fr', en: 'en', es: 'es', de: 'de', it: 'it', pt: 'pt',
  ar: 'ar', ja: 'ja', ko: 'ko', zh: 'zh-CN', ru: 'ru', hi: 'hi',
  tr: 'tr', nl: 'nl', pl: 'pl', sv: 'sv'
};

module.exports = {
  name: 'tts',
  aliases: ['speak', 'dire', 'voix'],
  category: 'outils',
  description: 'Convertit un texte en voix (audio). Usage : .tts [lang] <texte>',
  async execute(sock, m, from, args) {
    try {
      if (!args || args.length === 0) {
        return sock.sendMessage(from, { text: style.renderInfo([
          'Usage : .tts [lang] <texte>',
          'Ex : .tts fr bonjour tout le monde',
          'Langues : fr, en, es, de, it, pt, ar, ja, ko, zh, ru, hi, tr, nl, pl, sv'
        ]) }, { quoted: m });
      }

      let lang = 'fr';
      let textArgs = args;
      if (LANGS[args[0].toLowerCase()]) {
        lang = args[0].toLowerCase();
        textArgs = args.slice(1);
      }
      const text = textArgs.join(' ').trim();
      if (!text) return sock.sendMessage(from, { text: style.renderError(['Texte vide.']) }, { quoted: m });
      if (text.length > 200) {
        return sock.sendMessage(from, { text: style.renderError(['Texte trop long (max 200 caracteres).']) }, { quoted: m });
      }

      await sock.sendMessage(from, { react: { text: 'ðŸ”Š', key: m.key } });

      const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${LANGS[lang]}&q=${encodeURIComponent(text)}`;
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 20000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      const buf = Buffer.from(res.data);
      if (!buf || buf.length < 100) throw new Error('Audio vide.');

      await sock.sendMessage(from, {
        audio: buf,
        mimetype: 'audio/mpeg',
        ptt: true
      }, { quoted: m });
    } catch (e) {
      console.error('[TTS]', e.message);
      await sock.sendMessage(from, { text: style.renderError(['Erreur TTS : ' + e.message]) }, { quoted: m });
    }
  }
};