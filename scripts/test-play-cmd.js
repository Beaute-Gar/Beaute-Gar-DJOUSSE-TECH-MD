'use strict';
const play = require('../src/commandes/11-telechargement/play');

const sent = [];
const sock = {
  async sendMessage(from, content, opts) {
    sent.push(content);
    if (content.text) console.log('[SEND TEXT]', String(content.text).slice(0, 120));
    if (content.audio) console.log('[SEND AUDIO] bytes:', content.audio.length || (content.audio.buffer && content.audio.buffer.length), 'mime:', content.mimetype, 'file:', content.fileName);
    if (content.image) console.log('[SEND IMAGE]', content.caption);
    return {};
  }
};

(async () => {
  const file = await play.execute(sock, { key: { id: 'test' } }, '123@s.whatsapp.net', ['humain', 'feu', 'de', 'bois'], { testSaveToDesktop: true });
  console.log('SAVED FILE:', file);
  require('fs').statSync(file);
  console.log('SIZE:', require('fs').statSync(file).size);
  console.log('OK');
  process.exit(0);
})().catch(e => { console.log('ERR:', e.message); process.exit(1); });
