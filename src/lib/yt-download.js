'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

let ffmpegPath = null;
try { ffmpegPath = require('ffmpeg-static'); } catch (e) {}
let ytSearch = null;
try { ytSearch = require('yt-search'); } catch (e) {}

let ytdlLib = null;
function getYtdl() {
  if (ytdlLib) return ytdlLib;
  const mod = require('@distube/ytdl-core');
  if (mod && typeof mod.Ytdl === 'function') {
    ytdlLib = new mod.Ytdl();
    ytdlLib._Quality = mod.Quality;
  } else {
    throw new Error('Module YouTube indisponible');
  }
  return ytdlLib;
}

function streamToBuffer(stream, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { stream.destroy(); } catch (e) {}
      reject(new Error('Délai de téléchargement dépassé'));
    }, timeoutMs);
    stream.on('data', c => chunks.push(c));
    stream.once('end', () => { if (settled) return; settled = true; clearTimeout(timer); resolve(Buffer.concat(chunks)); });
    stream.once('error', e => { if (settled) return; settled = true; clearTimeout(timer); reject(e); });
  });
}

function runFfmpeg(args, inputBuffer) {
  if (!ffmpegPath) return Promise.reject(new Error('ffmpeg indisponible'));
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath, args);
    const out = [];
    const err = [];
    ff.stdout.on('data', c => out.push(c));
    ff.stderr.on('data', c => err.push(c));
    ff.once('error', reject);
    ff.once('close', code => {
      if (code === 0 && out.length) resolve(Buffer.concat(out));
      else reject(new Error('ffmpeg: ' + Buffer.concat(err).toString().slice(-300)));
    });
    if (inputBuffer) { ff.stdin.write(inputBuffer); ff.stdin.end(); }
    else ff.stdin.end();
  });
}

function transcodeToMp3(inputBuffer) {
  return runFfmpeg(
    ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn', '-acodec', 'libmp3lame', '-b:a', '192k', '-f', 'mp3', 'pipe:1'],
    inputBuffer
  );
}

async function resolveVideo(input) {
  const ytdl = getYtdl();
  const isUrl = /^https?:\/\//i.test(String(input || ''));
  let url = String(input || '').trim();
  let title;
  let thumbnail;

  if (!isUrl) {
    if (!ytSearch) throw new Error('Recherche YouTube indisponible');
    const s = await ytSearch(url);
    const first = s && s.videos && s.videos[0];
    if (!first) throw new Error('Aucun résultat YouTube');
    url = first.url || (first.videoId && 'https://www.youtube.com/watch?v=' + first.videoId);
    title = first.title;
    thumbnail = first.thumbnail;
  }
  if (!url) throw new Error('Lien YouTube invalide');

  const info = await ytdl.getInfo(url);
  return {
    ytdl,
    info,
    title: title || (info.videoDetails && info.videoDetails.title),
    thumbnail: thumbnail || (info.videoDetails && Array.isArray(info.videoDetails.thumbnail) && info.videoDetails.thumbnail[0] && info.videoDetails.thumbnail[0].url),
    pageUrl: url
  };
}

function pickFormats(info) {
  const formats = Array.isArray(info.formats) ? info.formats : [];
  const progressive = formats
    .filter(f => f.hasAudio && f.hasVideo && !f.isDrm && !f.isOtf)
    .sort((a, b) => (b.height || 0) - (a.height || 0));
  const videoOnlyMp4 = formats
    .filter(f => f.hasVideo && !f.hasAudio && !f.isDrm && !f.isOtf && f.container === 'mp4' && (f.height || 0) <= 720)
    .sort((a, b) => (b.height || 0) - (a.height || 0) || (b.bitrate || 0) - (a.bitrate || 0));
  const audioM4a = formats
    .filter(f => f.hasAudio && !f.hasVideo && !f.isDrm && !f.isOtf && f.container === 'mp4')
    .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
  const audioAny = formats
    .filter(f => f.hasAudio && !f.hasVideo && !f.isDrm && !f.isOtf)
    .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
  return { progressive, videoOnlyMp4, audioM4a, audioAny };
}

async function ytAudio(input) {
  const ctx = await resolveVideo(input);
  const { ytdl, info } = ctx;
  const Quality = ytdl._Quality;

  let audioBuffer;
  try {
    const stream = ytdl.download(info, { quality: Quality.HighestAudio });
    audioBuffer = await streamToBuffer(stream);
  } catch (e) {
    const { audioAny } = pickFormats(info);
    if (!audioAny.length) throw e;
    const stream = ytdl.download(info, { format: audioAny[0] });
    audioBuffer = await streamToBuffer(stream);
  }
  if (!audioBuffer || !audioBuffer.length) throw new Error('Audio vide');

  let mp3;
  try { mp3 = await transcodeToMp3(audioBuffer); } catch (e) { mp3 = null; }
  if (mp3 && mp3.length) {
    return { title: ctx.title, thumbnail: ctx.thumbnail, buffer: mp3, mimetype: 'audio/mpeg', ext: 'mp3', pageUrl: ctx.pageUrl };
  }
  // Fallback : renvoyer l'audio brut (webm/m4a)
  const isM4a = audioBuffer.slice(4, 8).toString() === 'ftyp';
  return {
    title: ctx.title,
    thumbnail: ctx.thumbnail,
    buffer: audioBuffer,
    mimetype: isM4a ? 'audio/mp4' : 'audio/webm',
    ext: isM4a ? 'm4a' : 'webm',
    pageUrl: ctx.pageUrl
  };
}

async function ytVideo(input) {
  const ctx = await resolveVideo(input);
  const { ytdl, info } = ctx;
  const { progressive, videoOnlyMp4, audioM4a } = pickFormats(info);

  // 1) flux progressif (audio+vidéo dans un seul fichier)
  if (progressive.length) {
    const fmt = progressive[0];
    try {
      const stream = ytdl.download(info, { format: fmt });
      const buf = await streamToBuffer(stream);
      if (buf && buf.length) {
        return { title: ctx.title, thumbnail: ctx.thumbnail, buffer: buf, mimetype: 'video/mp4', ext: 'mp4', pageUrl: ctx.pageUrl };
      }
    } catch (e) {}
  }

  // 2) mux vidéo (mp4) + audio (m4a)
  if (videoOnlyMp4.length && audioM4a.length) {
    const vFmt = videoOnlyMp4[0];
    const aFmt = audioM4a[0];
    const vStream = ytdl.download(info, { format: vFmt });
    const aStream = ytdl.download(info, { format: aFmt });
    const [vBuf, aBuf] = await Promise.all([streamToBuffer(vStream), streamToBuffer(aStream)]);
    const out = await muxMp4(vBuf, aBuf);
    if (out && out.length) {
      return { title: ctx.title, thumbnail: ctx.thumbnail, buffer: out, mimetype: 'video/mp4', ext: 'mp4', pageUrl: ctx.pageUrl };
    }
  }

  // 3) dernier recours : meilleure vidéo seule
  const Quality = ytdl._Quality;
  const stream = ytdl.download(info, { quality: Quality.Highest });
  const buf = await streamToBuffer(stream);
  if (!buf || !buf.length) throw new Error('Vidéo introuvable');
  return { title: ctx.title, thumbnail: ctx.thumbnail, buffer: buf, mimetype: 'video/mp4', ext: 'mp4', pageUrl: ctx.pageUrl };
}

function muxMp4(videoBuffer, audioBuffer) {
  if (!ffmpegPath) return Promise.resolve(null);
  const stamp = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const vFile = path.join(os.tmpdir(), `ytv_${stamp}.mp4`);
  const aFile = path.join(os.tmpdir(), `yta_${stamp}.m4a`);
  const oFile = path.join(os.tmpdir(), `yto_${stamp}.mp4`);
  try {
    fs.writeFileSync(vFile, videoBuffer);
    fs.writeFileSync(aFile, audioBuffer);
  } catch (e) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const ff = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-i', vFile, '-i', aFile, '-c', 'copy', '-shortest', oFile]);
    ff.once('error', () => cleanup());
    ff.once('close', code => {
      let out = null;
      try { if (code === 0) out = fs.readFileSync(oFile); } catch (e) {}
      cleanup();
      resolve(out);
    });
    ff.stdin.end();

    function cleanup() {
      for (const f of [vFile, aFile, oFile]) { try { fs.unlinkSync(f); } catch (e) {} }
    }
  });
}

module.exports = { ytAudio, ytVideo, resolveVideo, transcodeToMp3 };
