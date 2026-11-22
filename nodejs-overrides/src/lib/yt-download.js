'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const compatPaths = require('../compat/paths');

let ffmpegWrapper = null;
try { ffmpegWrapper = require('../../lib/ffmpeg-wrapper'); } catch (e) {}
let ytSearch = null;
try { ytSearch = require('yt-search'); } catch (e) {}
let mediaDownload = null;
try { mediaDownload = require('./media-download'); } catch (e) {}

let ytdlLib = null;
function getYtdl() {
  if (ytdlLib) return ytdlLib;
  const mod = require('@distube/ytdl-core');

  // Ancienne API à classe : new Ytdl()
  if (mod && typeof mod.Ytdl === 'function') {
    ytdlLib = new mod.Ytdl();
    ytdlLib._Quality = mod.Quality;
    return ytdlLib;
  }

  // API actuelle de @distube/ytdl-core : module fonction + getInfo/downloadFromInfo
  if (typeof mod === 'function' && typeof mod.getInfo === 'function') {
    ytdlLib = {
      getInfo: mod.getInfo,
      downloadFromInfo: mod.downloadFromInfo,
      chooseFormat: mod.chooseFormat,
      _Quality: { HighestAudio: 'highestaudio', Highest: 'highest' },
      download: function (infoOrUrl, options) {
        if (typeof infoOrUrl === 'string') return mod(infoOrUrl, options);
        if (typeof mod.downloadFromInfo === 'function') {
          return mod.downloadFromInfo(infoOrUrl, options);
        }
        throw new Error('Téléchargement YouTube indisponible');
      }
    };
    return ytdlLib;
  }

  throw new Error('Module YouTube indisponible');
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

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(label + ' timeout')), timeoutMs);
  });
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    timeout
  ]);
}

async function transcodeToMp3(inputBuffer) {
  if (!ffmpegWrapper || !ffmpegWrapper.getFfmpegPath()) {
    throw new Error('ffmpeg non disponible sur cet appareil');
  }

  const stamp = Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const inFile = path.join(compatPaths.tmpdir(), `yta_in_${stamp}`);
  const outFile = path.join(compatPaths.tmpdir(), `yta_out_${stamp}.mp3`);

  try {
    fs.writeFileSync(inFile, inputBuffer);
    await ffmpegWrapper.runFfmpeg([
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', inFile,
      '-vn', '-acodec', 'libmp3lame', '-b:a', '192k',
      outFile
    ], 180000);
    return fs.readFileSync(outFile);
  } finally {
    try { if (fs.existsSync(inFile)) fs.unlinkSync(inFile); } catch (e) {}
    try { if (fs.existsSync(outFile)) fs.unlinkSync(outFile); } catch (e) {}
  }
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

async function ytAudioYtdl(input) {
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

async function ytVideoYtdl(input) {
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

async function muxMp4(videoBuffer, audioBuffer) {
  if (!ffmpegWrapper || !ffmpegWrapper.getFfmpegPath()) return null;

  const stamp = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const vFile = path.join(compatPaths.tmpdir(), `ytv_${stamp}.mp4`);
  const aFile = path.join(compatPaths.tmpdir(), `yta_${stamp}.m4a`);
  const oFile = path.join(compatPaths.tmpdir(), `yto_${stamp}.mp4`);

  try {
    fs.writeFileSync(vFile, videoBuffer);
    fs.writeFileSync(aFile, audioBuffer);
    await ffmpegWrapper.runFfmpeg([
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', vFile, '-i', aFile,
      '-c', 'copy', '-shortest', oFile
    ], 180000);
    return fs.readFileSync(oFile);
  } catch (e) {
    return null;
  } finally {
    for (const f of [vFile, aFile, oFile]) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {}
    }
  }
}

async function downloadYtBuffer(url, pageUrl, timeoutMs = 90000) {
  if (!url) throw new Error('Lien YouTube introuvable');

  const task = (async function () {
    if (mediaDownload && typeof mediaDownload.downloadBuffer === 'function') {
      return mediaDownload.downloadBuffer(url, pageUrl);
    }
    const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return Buffer.from(await res.arrayBuffer());
  })();

  return withTimeout(task, timeoutMs, 'Téléchargement YouTube');
}

async function ytAudioFallback(input) {
  if (!mediaDownload || typeof mediaDownload.ytDownload !== 'function') {
    throw new Error('Module YouTube indisponible');
  }
  const data = await withTimeout(mediaDownload.ytDownload(String(input)), 30000, 'Résolution YouTube');
  const audioUrl = data && (data.audio || data.video);
  if (!audioUrl) throw new Error('Audio YouTube introuvable');

  let raw;
  try {
    raw = await downloadYtBuffer(data.audio, data.pageUrl);
  } catch (e) {
    raw = await downloadYtBuffer(data.video, data.pageUrl);
  }
  if (!raw || !raw.length) throw new Error('Audio vide');

  let mp3 = null;
  try { mp3 = await transcodeToMp3(raw); } catch (e) {}
  if (mp3 && mp3.length) {
    return {
      title: data.title || 'YouTube',
      thumbnail: data.thumbnail,
      buffer: mp3,
      mimetype: 'audio/mpeg',
      ext: 'mp3',
      pageUrl: data.pageUrl
    };
  }

  const isM4a = raw.slice(4, 8).toString() === 'ftyp';
  return {
    title: data.title || 'YouTube',
    thumbnail: data.thumbnail,
    buffer: raw,
    mimetype: isM4a ? 'audio/mp4' : 'audio/webm',
    ext: isM4a ? 'm4a' : 'webm',
    pageUrl: data.pageUrl
  };
}

async function ytVideoFallback(input) {
  if (!mediaDownload || typeof mediaDownload.ytDownload !== 'function') {
    throw new Error('Module YouTube indisponible');
  }
  const data = await withTimeout(mediaDownload.ytDownload(String(input)), 30000, 'Résolution YouTube');
  if (!data || !data.video) throw new Error('Vidéo YouTube introuvable');

  const vBuf = await downloadYtBuffer(data.video, data.pageUrl);
  if (!vBuf || !vBuf.length) throw new Error('Vidéo vide');

  let out = vBuf;
  if (data.audio) {
    try {
      const aBuf = await downloadYtBuffer(data.audio, data.pageUrl);
      const muxed = await muxMp4(vBuf, aBuf);
      if (muxed && muxed.length) out = muxed;
    } catch (e) { /* on garde la vidéo seule */ }
  }

  return {
    title: data.title || 'YouTube',
    thumbnail: data.thumbnail,
    buffer: out,
    mimetype: 'video/mp4',
    ext: 'mp4',
    pageUrl: data.pageUrl
  };
}

async function ytAudio(input) {
  try {
    return await withTimeout(ytAudioYtdl(input), 30000, 'ytdl audio');
  } catch (e) {
    console.log('[yt-download] fallback audio : ' + ((e && e.message) || e));
    try {
      return await withTimeout(ytAudioFallback(input), 180000, 'fallback audio');
    } catch (e2) {
      console.error('[yt-download] fallback audio echoue : ' + ((e2 && e2.message) || e2));
      throw e;
    }
  }
}

async function ytVideo(input) {
  try {
    return await withTimeout(ytVideoYtdl(input), 40000, 'ytdl video');
  } catch (e) {
    console.log('[yt-download] fallback video : ' + ((e && e.message) || e));
    try {
      return await withTimeout(ytVideoFallback(input), 240000, 'fallback video');
    } catch (e2) {
      console.error('[yt-download] fallback video echoue : ' + ((e2 && e2.message) || e2));
      throw e;
    }
  }
}

module.exports = { ytAudio, ytVideo, resolveVideo, transcodeToMp3 };
