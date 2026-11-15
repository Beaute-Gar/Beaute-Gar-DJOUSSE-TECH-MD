'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'shazam',
  category: 'telechargement',
  description: 'Identifie une musique depuis un audio (fonctionnalité limitée)',
  async execute(sock, m, from) {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const isAudio = m.message?.audioMessage || quoted?.audioMessage;
    if (!isAudio) {
      return sock.sendMessage(from, { text: style.renderError(['Répondez à un message audio ou une note vocale avec .shazam']) });
    }
    return sock.sendMessage(from, { text: style.renderInfo([
      'Reconnaissance musicale indisponible dans cette version (aucun service de fingerprinting configuré).',
      'Astuce : utilisez .play <titre/paroles> ou .lyrics <titre> si vous connaissez une partie du morceau.'
    ]) });
  }
};
