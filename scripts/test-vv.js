'use strict';
// Test rapide des modules .vv / .num
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else { console.log('OK  :', msg); } };

// Remplace le telechargement reseau par un faux buffer pour tester .vv hors ligne.
const baileysPath = require.resolve('@whiskeysockets/baileys');
const baileys = require(baileysPath);
require.cache[baileysPath].exports = Object.assign({}, baileys, {
  downloadMediaMessage: async () => Buffer.from('test-media')
});

const fs = require('fs');
const path = require('path');
const numstore = require('../src/lib/numstore');
assert(typeof numstore.clean === 'function', 'numstore.clean');
assert(numstore.clean('12345678') === '12345678', 'clean valid');
assert(numstore.clean('123') === null, 'clean invalid');

const vv = require('../src/commandes/04-sticker-media/viewonce');
assert(vv.name === 'vv', 'vv.name');
assert(Array.isArray(vv.aliases) && vv.aliases.includes('viewonce'), 'vv alias viewonce');
assert(typeof vv.execute === 'function', 'vv.execute');
assert(typeof vv.run === 'function', 'vv.run');
assert(Array.isArray(vv.commands) && vv.commands.includes('vv'), 'vv.commands');

const ad = require('../src/handlers/antidelete-handler');
assert(typeof ad.captureViewOnce === 'function', 'captureViewOnce exported');
assert(typeof ad.getStoredMedia === 'function', 'getStoredMedia exported');
assert(typeof ad.getCachedMessage === 'function', 'getCachedMessage exported');
assert(typeof ad.describeMedia === 'function', 'describeMedia exported');
assert(typeof ad.hasDownloadKeys === 'function', 'hasDownloadKeys exported');
assert(typeof ad.isZeroHash === 'function', 'isZeroHash exported');

const stub = {
  videoMessage: {
    mimetype: 'video/mp4',
    fileSha256: Buffer.alloc(32),
    viewOnce: true
  }
};
const stubInfo = ad.describeMedia({ message: stub });
assert(stubInfo.type === 'video', 'describeMedia detects video');
assert(stubInfo.hasMediaKey === false, 'stub has no mediaKey');
assert(stubInfo.hasDirectPath === false, 'stub has no directPath');
assert(stubInfo.zeroHash === true, 'stub has zero hash');

assert(ad.hasDownloadKeys({ mediaKey: Buffer.from([1]), directPath: '/x' }) === true, 'hasDownloadKeys true');
assert(ad.hasDownloadKeys({ mediaKey: Buffer.from([1]) }) === false, 'hasDownloadKeys false without path');
assert(ad.hasDownloadKeys({ directPath: '/x' }) === false, 'hasDownloadKeys false without key');
assert(ad.isZeroHash(Buffer.alloc(32)) === true, 'isZeroHash true');
assert(ad.isZeroHash(Buffer.from([1])) === false, 'isZeroHash false');

const ch = require('../src/handlers/command-handler');
ch.loadCommands();
assert(!!ch.find('vv'), 'command-handler finds vv');
assert(!!ch.find('viewonce'), 'command-handler finds viewonce alias');
assert(!!ch.find('num'), 'command-handler finds num');
assert(!!ch.find('tts'), 'command-handler finds tts');
assert(!!ch.find('ssweb'), 'command-handler finds ssweb');
assert(!!ch.find('shorten'), 'command-handler finds shorten');
assert(!!ch.find('ephoto'), 'command-handler finds ephoto');
assert(!!ch.find('anime'), 'command-handler finds anime');
assert(!!ch.find('tictactoe'), 'command-handler finds tictactoe');
assert(!!ch.find('football'), 'command-handler finds football');
assert(!!ch.find('promo'), 'command-handler finds promo');
assert(!!ch.find('prono'), 'command-handler finds promo alias');
assert(!!ch.find('statut'), 'command-handler finds statut');
assert(!!ch.find('status'), 'command-handler finds status');
assert(!!ch.find('autostatus'), 'command-handler finds autostatus');

(async () => {
  const sent = [];
  const sock = {
    async sendMessage(jid, content) {
      sent.push(content);
    }
  };

  const from = '123@s.whatsapp.net';
  const message = {
    key: { remoteJid: from, id: 'cmd-1' },
    message: {
      extendedTextMessage: {
        text: '.vv',
        contextInfo: {
          stanzaId: 'vv-1',
          quotedMessage: stub
        }
      }
    }
  };

  await vv.execute(sock, message, from, []);
  const texts = sent.filter((x) => x && x.text).map((x) => x.text);
  assert(texts.some((t) => /mediaKey|masqu/i.test(t)), '.vv explains the redacted media');

  await vv.execute(sock, message, from, ['info']);
  const infoText = sent.filter((x) => x && x.text).map((x) => x.text).pop();
  assert(/Réponds|appareils liés/i.test(infoText || ''), '.vv info works');

  // PDO : le telephone principal renvoie le message complet.
  const pdoChat = 'pdo@s.whatsapp.net';
  const pdoFull = {
    key: { remoteJid: pdoChat, id: 'vv-pdo-test' },
    message: {
      viewOnceMessageV2: {
        message: {
          imageMessage: {
            mediaKey: Buffer.from([7]),
            directPath: '/v/test',
            url: 'https://mmg.whatsapp.net/test',
            mimetype: 'image/jpeg',
            caption: 'pdo test',
            fileSha256: Buffer.from([1]),
            viewOnce: true
          }
        }
      }
    }
  };
  const pdoSent = [];
  const pdoSock = {
    _on: null,
    ev: {
      on(event, fn) {
        if (event === 'messages.upsert') pdoSock._on = fn;
      },
      off(event, fn) {
        if (event === 'messages.upsert' && pdoSock._on === fn) pdoSock._on = null;
      }
    },
    async sendMessage(jid, content) { pdoSent.push(content); },
    async requestPlaceholderResend() {
      setTimeout(() => {
        ad.cacheMessage(pdoFull);
        if (pdoSock._on) pdoSock._on({ messages: [pdoFull] });
      }, 300);
      return 'req-test';
    }
  };
  const pdoMessage = {
    key: { remoteJid: pdoChat, id: 'cmd-pdo' },
    message: {
      extendedTextMessage: {
        text: '.vv',
        contextInfo: { stanzaId: 'vv-pdo-test', quotedMessage: stub }
      }
    }
  };
  await vv.execute(pdoSock, pdoMessage, pdoChat, []);
  const pdoMedia = pdoSent.find((x) => x && x.image);
  assert(!!pdoMedia, '.vv recovers via PDO resend');
  assert(pdoMedia && Buffer.from(pdoMedia.image).toString() === 'test-media', '.vv PDO media content');

  // Persistance disque.
  const diskChat = 'disk@s.whatsapp.net';
  const diskDir = path.join(process.cwd(), 'storage', 'vv', diskChat.replace(/[^a-zA-Z0-9._@-]/g, '_'));
  fs.mkdirSync(diskDir, { recursive: true });
  fs.writeFileSync(path.join(diskDir, 'disk-1.bin'), Buffer.from('disk-media'));
  fs.writeFileSync(path.join(diskDir, 'disk-1.json'), JSON.stringify({
    type: 'image',
    mimetype: 'image/jpeg',
    caption: 'disk'
  }));
  const disk = ad.getStoredMedia(diskChat, 'disk-1');
  assert(disk && disk.buffer.toString() === 'disk-media', '.vv disk persistence');
  fs.rmSync(diskDir, { recursive: true, force: true });

  const menuUi = require('../src/lib/menu-ui');
  const summary = menuUi.buildMenuSummaryText({ prefix: '.', botName: 'TEST' });
  assert(/promo/.test(summary), 'menu includes promo');
  assert(/\bvv\b/.test(summary), 'menu includes vv');

  console.log('\nTous les tests passes.');
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exitCode = 1;
});
