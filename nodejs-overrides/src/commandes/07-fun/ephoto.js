'use strict';
const style = require('../../config/style');
// cheerio 1.x -> undici 7 appelle `new File(...)` des le require. File n'existe
// pas dans Node 18.20.4 : on installe le polyfill AVANT de charger mumaker.
require('../../compat/globals').install();
const mumaker = require('mumaker');

const EFFECTS = {
  fire: 'https://en.ephoto360.com/flame-lettering-effect-372.html',
  neon: 'https://en.ephoto360.com/create-colorful-neon-light-text-effects-online-797.html',
  matrix: 'https://en.ephoto360.com/matrix-text-effect-154.html',
  glitch: 'https://en.ephoto360.com/create-digital-glitch-text-effects-online-767.html',
  ice: 'https://en.ephoto360.com/ice-text-effect-online-101.html',
  thunder: 'https://en.ephoto360.com/thunder-text-effect-online-97.html',
  blackpink: 'https://en.ephoto360.com/create-a-blackpink-style-logo-with-members-signatures-810.html',
  sand: 'https://en.ephoto360.com/write-names-and-messages-on-the-sand-online-582.html',
  snow: 'https://en.ephoto360.com/create-a-snow-3d-text-effect-free-online-621.html',
  purple: 'https://en.ephoto360.com/purple-text-effect-online-100.html',
  metallic: 'https://en.ephoto360.com/impressive-decorative-3d-metal-text-effect-798.html',
  light: 'https://en.ephoto360.com/light-text-effect-futuristic-technology-style-648.html',
  leaves: 'https://en.ephoto360.com/green-brush-text-effect-typography-maker-online-153.html',
  impressive: 'https://en.ephoto360.com/create-3d-colorful-paint-text-effect-online-801.html',
  devil: 'https://en.ephoto360.com/neon-devil-wings-text-effect-online-683.html',
  hacker: 'https://en.ephoto360.com/create-anonymous-hacker-avatars-cyan-neon-677.html',
  arena: 'https://en.ephoto360.com/create-cover-arena-of-valor-by-mastering-360.html',
  '1917': 'https://en.ephoto360.com/1917-style-text-effect-523.html'
};

module.exports = {
  name: 'ephoto',
  aliases: ['texteffect', 'fx', 'effet'],
  category: 'fun',
  description: 'Effet texte sur image (ephoto360). Usage : .ephoto <effet> <texte>',
  async execute(sock, m, from, args) {
    try {
      const effect = (args && args[0]) ? args[0].toLowerCase() : '';
      const text = (args || []).slice(1).join(' ').trim();

      if (!effect || effect === 'list' || effect === 'liste') {
        const list = Object.keys(EFFECTS).join(', ');
        return sock.sendMessage(from, { text: style.renderInfo([
          'Effets disponibles :', list,
          'Usage : .ephoto fire MonTexte'
        ]) }, { quoted: m });
      }

      if (!EFFECTS[effect]) {
        return sock.sendMessage(from, { text: style.renderError([
          'Effet inconnu : ' + effect,
          'Tapez .ephoto list pour la liste.'
        ]) }, { quoted: m });
      }
      if (!text) {
        return sock.sendMessage(from, { text: style.renderError(['Texte manquant. Ex : .ephoto fire Nick']) }, { quoted: m });
      }

      await sock.sendMessage(from, { react: { text: 'ðŸŽ¨', key: m.key } });

      const result = await mumaker.ephoto(EFFECTS[effect], text);
      if (!result || !result.image) throw new Error('Aucune image recue.');

      await sock.sendMessage(from, {
        image: { url: result.image },
        caption: `Effet ${effect} pour : ${text}`
      }, { quoted: m });
    } catch (e) {
      console.error('[EPHOTO]', e.message);
      await sock.sendMessage(from, { text: style.renderError(['Erreur : ' + e.message]) }, { quoted: m });
    }
  }
};