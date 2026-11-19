'use strict';
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const MOBILE = process.env.MOBILE === '1';

module.exports = {
  MOBILE: MOBILE,
  botName:     process.env.BOT_NAME     || 'DJOUSSE TECH MD',
  prefix:      process.env.PREFIX       || '.',
  ownerNumber: process.env.OWNER_NUMBER || '',
  ownerName:   process.env.OWNER_NAME   || 'DJOUSSE TECH',
  version:     '1.0.0',
  startTime:   Date.now(),

  // Demarrage automatique des sessions deja jumelees.
  // Desactiver avec AUTO_START=false dans .env
  autoStart: String(process.env.AUTO_START || 'true').toLowerCase() !== 'false',

  // Anti-ban : ralentit les envois pour imiter un humain.
  // Desactiver avec HUMANIZE=false dans .env
  humanize: String(process.env.HUMANIZE || 'true').toLowerCase() !== 'false',
  humanizeOptions: {
    minDelay:       Number(process.env.HUMANIZE_MIN_DELAY)  || 700,
    maxDelay:       Number(process.env.HUMANIZE_MAX_DELAY)  || 1800,
    perChatGap:     Number(process.env.HUMANIZE_CHAT_GAP)   || 1200,
    maxPerMinute:   Number(process.env.HUMANIZE_PER_MINUTE) || 18,
    typingPerChar:  Number(process.env.HUMANIZE_TYPING_MS)  || 20,
    maxTyping:      Number(process.env.HUMANIZE_MAX_TYPING) || 2500
  }
};