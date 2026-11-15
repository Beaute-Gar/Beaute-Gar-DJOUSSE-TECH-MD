'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'transcribe',
  aliases: ['stt'],
  category: 'ia',
  description: 'Transcrit un audio en texte',
  async execute(sock, m, from) {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const isAudio = m.message?.audioMessage || quoted?.audioMessage;
    
    if (!isAudio) {
      return sock.sendMessage(from, { text: style.renderError(['Repondez a un audio avec .transcribe']) });
    }

    await sock.sendMessage(from, { text: style.renderInfo(['Fonctionnalite de transcription en developpement...']) });
  }
};
