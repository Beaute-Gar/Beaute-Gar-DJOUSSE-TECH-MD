'use strict';

const style = require('../../config/style');
const { runFfmpeg, getFfmpegPath } = require('../../../lib/ffmpeg-wrapper');
const fs = require('fs');
const path = require('path');
let ytSearch = null;
try { ytSearch = require('yt-search'); } catch (e) {}

module.exports = {
  name: 'ytmp4',
  aliases: ['ytv', 'video'],
  category: 'telechargement',
  description: 'Recherche et télécharge une vidéo YouTube au format MP4',

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
        text: style.renderError(['Précise un titre ou un lien YouTube. Exemple : .ytmp4 Burna Boy City Boys'])
      });
    }

    await sock.sendMessage(targetChat, {
      text: style.renderInfo([`Recherche de "${query}" en cours…`])
    }, { quoted: msg });

    const dataDir = process.env.BOT_DATA_DIR || path.join(__dirname, '..', '..', '..', 'test-data');
    const stamp = Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const rawInput = path.join(dataDir, `ytv_in_${stamp}.raw`);
    const outputMp4 = path.join(dataDir, `ytv_${stamp}.mp4`);

    try {
      let targetUrl = query;
      let title = 'Vidéo YouTube';

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
      const result = await ytDl.ytVideo(targetUrl);
      title = result.title || title;
      const sourceBuffer = result.buffer;

      if (!sourceBuffer || !sourceBuffer.length) {
        throw new Error('Impossible d\'extraire le flux vidéo pour ce lien.');
      }

      fs.writeFileSync(rawInput, sourceBuffer);

      // Traitement et normalisation MP4 (h264/aac) pour compatibilité maximale avec WhatsApp
      await runFfmpeg([
        '-y',
        '-i', rawInput,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        outputMp4
      ]);

      const videoBuffer = fs.readFileSync(outputMp4);
      await sock.sendMessage(targetChat, {
        video: videoBuffer,
        caption: `🎬 *${title}*\n\n_Téléchargé par DJOUSSE TECH MD_`
      }, { quoted: msg });

    } catch (e) {
      console.error('[ytmp4]', e);
      await sock.sendMessage(targetChat, {
        text: style.renderError([
          `Erreur téléchargement vidéo : ${e.message}`
        ])
      });
    } finally {
      try { if (fs.existsSync(rawInput)) fs.unlinkSync(rawInput); } catch (e) {}
      try { if (fs.existsSync(outputMp4)) fs.unlinkSync(outputMp4); } catch (e) {}
    }
  }
};
