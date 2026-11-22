'use strict';

const style = require('../../config/style');
const { runFfmpeg, getFfmpegPath } = require('../../../lib/ffmpeg-wrapper');
const fs = require('fs');
const path = require('path');
let ytSearch = null;
try { ytSearch = require('yt-search'); } catch (e) {}

module.exports = {
  name: 'ytmp3',
  aliases: ['play', 'yta', 'audio'],
  category: 'telechargement',
  description: 'Recherche et télécharge une piste audio YouTube au format MP3',

  async execute(first, m, from, args) {
    let sock = first;
    let msg = m;
    let targetChat = from;
    let queryArgs = args;

    if (first && first.sock) {
      sock = first.sock;
      msg = first.msg;
      targetChat = first.sender ? first.sender.chatJid : (first.msg && first.msg.key && first.msg.key.remoteJid);
      queryArgs = first.args || (first.text ? first.text.split(/\s+/) : []);
    }

    if (!getFfmpegPath()) {
      return sock.sendMessage(targetChat, {
        text: style.renderError(['ffmpeg non disponible sur cet appareil'])
      });
    }

    const query = Array.isArray(queryArgs) ? queryArgs.join(' ').trim() : String(queryArgs || '').trim();
    if (!query) {
      return sock.sendMessage(targetChat, {
        text: style.renderError(['Précise un titre ou un lien YouTube. Exemple : .ytmp3 Burna Boy City Boys'])
      });
    }

    await sock.sendMessage(targetChat, {
      text: style.renderInfo([`Recherche de "${query}" en cours…`])
    }, { quoted: msg });

    const dataDir = process.env.BOT_DATA_DIR || path.join(__dirname, '..', '..', '..', 'test-data');
    const stamp = Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const rawInput = path.join(dataDir, `yt_in_${stamp}.raw`);
    const outputMp3 = path.join(dataDir, `yt_${stamp}.mp3`);

    try {
      let targetUrl = query;
      let title = 'Audio YouTube';

      if (!query.startsWith('http')) {
        if (!ytSearch) throw new Error('Module yt-search indisponible');
        const s = await ytSearch(query);
        const video = s?.videos?.[0];
        if (!video) {
          return sock.sendMessage(targetChat, {
            text: style.renderError([`Aucun résultat trouvé pour "${query}".`])
          });
        }
        targetUrl = video.url;
        title = video.title || title;
      }

      // Pipeline unique validé sur Android : ytdl puis repli media-download,
      // avec délais maximum pour ne pas bloquer le socket WhatsApp.
      const ytDl = require('../../lib/yt-download');
      const result = await ytDl.ytAudio(targetUrl);
      title = result.title || title;
      let sourceBuffer = result.buffer;

      if (!sourceBuffer || !sourceBuffer.length) {
        throw new Error('Impossible d\'extraire le flux audio pour cette vidéo.');
      }

      let mp3Buffer = sourceBuffer;
      if (result.mimetype !== 'audio/mpeg') {
        fs.writeFileSync(rawInput, sourceBuffer);

        // Conversion vers MP3 stéréo 128k via FFmpegKit
        await runFfmpeg([
          '-y',
          '-i', rawInput,
          '-vn',
          '-c:a', 'libmp3lame',
          '-b:a', '128k',
          outputMp3
        ]);
        mp3Buffer = fs.readFileSync(outputMp3);
      }

      await sock.sendMessage(targetChat, {
        audio: mp3Buffer,
        mimetype: 'audio/mpeg',
        fileName: `${title.replace(/[\\/:*?"<>|]/g, '')}.mp3`
      }, { quoted: msg });

    } catch (e) {
      console.error('[ytmp3]', e);
      await sock.sendMessage(targetChat, {
        text: style.renderError([
          `Erreur téléchargement audio : ${e.message}`
        ])
      });
    } finally {
      try { if (fs.existsSync(rawInput)) fs.unlinkSync(rawInput); } catch (e) {}
      try { if (fs.existsSync(outputMp3)) fs.unlinkSync(outputMp3); } catch (e) {}
    }
  }
};
