'use strict';

const fs = require('fs');
const path = require('path');

function pickFirst(...vals) {
  for (const v of vals) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      for (const x of v) {
        const p = pickFirst(x);
        if (p) return p;
      }
    } else if (typeof v === 'object') {
      const p = v.url || v.link || v.download || v.dl || v.mp4 || v.mp3 || v.video || v.audio || v.src || v.image || v.HD || v.hd || v.Normal_video || v.nowm;
      if (typeof p === 'string' && p.startsWith('http')) return p;
      if (p) {
        const q = pickFirst(p);
        if (q) return q;
      }
    } else if (typeof v === 'string' && v.startsWith('http')) {
      return v;
    }
  }
  return null;
}

async function downloadBuffer(url, referer) {
  const u = String(url || '');
  const attempts = [];
  if (u.includes('klickaud')) attempts.push({ headers: { 'user-agent': 'Mozilla/5.0', 'accept': '*/*', 'referer': 'https://klickaud.org/' } });
  if (u.includes('spotimate')) attempts.push({ headers: { 'user-agent': 'Mozilla/5.0', 'accept': '*/*', 'referer': 'https://spotimate.app/' } });
  attempts.push(
    { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36', 'accept': '*/*', ...(referer ? { referer } : {}) } },
    { headers: { 'user-agent': 'Mozilla/5.0', 'accept': '*/*', 'referer': referer || 'https://www.google.com/' } },
    { headers: { 'user-agent': 'Mozilla/5.0', 'accept': '*/*' } },
  );
  let lastErr = null;
  for (const opt of attempts) {
    try {
      const res = await fetch(url, { redirect: 'follow', ...opt });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr = await res.arrayBuffer();
      const buf = Buffer.from(arr);
      if (!buf.length) throw new Error('Fichier vide');
      return buf;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Téléchargement impossible');
}

async function ytDownload(urlOrQuery) {
  let btch, yts;
  try { ({ youtube: btch, yts } = require('btch-downloader')); } catch (e) {}
  const isUrl = /youtu\.?be/.test(urlOrQuery);
  let target = urlOrQuery;
  let meta = {};
  if (!isUrl && yts) {
    const s = await yts(urlOrQuery);
    let list = [];
    if (s && Array.isArray(s.videos)) list = s.videos;
    else if (s && s.result && Array.isArray(s.result.all)) list = s.result.all.filter(x => x && x.type === 'video');
    else if (s && Array.isArray(s.result)) list = s.result;
    else if (s && Array.isArray(s.data)) list = s.data;
    else if (Array.isArray(s)) list = s;
    const first = list[0];
    target = first && (first.url || (first.videoId && `https://www.youtube.com/watch?v=${first.videoId}`));
    meta = { title: first && (first.title || first.name), thumbnail: first && (first.thumbnail || first.image) };
    if (!target) throw new Error('Aucun résultat YouTube');
  }
  if (btch) {
    const targets = [target, String(target).replace('https://youtube.com/', 'https://www.youtube.com/')];
    for (const t of targets) {
      try {
        const r = await btch(t);
        const video = pickFirst(r && r.mp4, r && r.video, r && r.url, r && r.result && r.result.mp4);
        const audio = pickFirst(r && r.mp3, r && r.audio, r && r.result && r.result.mp3);
        if (video || audio) {
          return { title: (r && r.title) || meta.title || 'YouTube', thumbnail: (r && r.thumbnail) || meta.thumbnail, video, audio, pageUrl: t };
        }
      } catch (e) {}
    }
  }
  throw new Error('Téléchargement YouTube indisponible');
}

async function tiktokDownload(url) {
  try {
    const res = await fetch(`https://tikwm.com/api/?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    if (data && data.code === 0 && data.data && data.data.play) {
      let video = data.data.play;
      if (typeof video === 'string' && video.startsWith('/')) video = 'https://tikwm.com' + video;
      let audio = data.data.music;
      if (typeof audio === 'string' && audio.startsWith('/')) audio = 'https://tikwm.com' + audio;
      return { title: data.data.title || 'TikTok', video, audio, thumbnail: data.data.cover };
    }
  } catch (e) {}
  try {
    const { ttdl } = require('btch-downloader');
    const r = await ttdl(url);
    const video = pickFirst(r && r.video, r && r.nowm, r && r.result && r.result.video);
    const audio = pickFirst(r && r.audio, r && r.music);
    if (video || audio) return { title: (r && r.title) || 'TikTok', video, audio, thumbnail: r && r.thumbnail };
  } catch (e) {}
  throw new Error('Téléchargement TikTok indisponible');
}

async function igDownload(url) {
  // kalss-scraper
  try {
    const k = require('kalss-scraper');
    if (k && k.instagram && typeof k.instagram.download === 'function') {
      const r = await k.instagram.download(url);
      const arr = Array.isArray(r && r.results) ? r.results : (Array.isArray(r) ? r : []);
      const urls = arr.map(x => pickFirst(x && x.url, x)).filter(Boolean);
      if (urls.length) return urls;
    }
  } catch (e) {}
  // btch-downloader
  try {
    const { igdl } = require('btch-downloader');
    const r = await igdl(url);
    const items = Array.isArray(r) ? r : (r && (r.result || r.data || r.url || r.media)) || [];
    const arr = Array.isArray(items) ? items : [items];
    const urls = arr.map(x => typeof x === 'string' ? x : pickFirst(x && x.url, x && x.download, x && x.link, x)).filter(Boolean);
    if (urls.length) return urls;
  } catch (e) {}
  // coflyn-scrapr
  try {
    const c = require('@coflyn/scrapr');
    const methods = ['indown', 'snapinsta', 'snapsave', 'direct'];
    for (const m of methods) {
      if (c.instagram && typeof c.instagram[m] === 'function') {
        try {
          const r = await c.instagram[m](url);
          const urls = [];
          const collect = (v) => { const u = pickFirst(v); if (u) urls.push(u); };
          if (r) {
            collect(r.url); collect(r.result); collect(r.downloads); collect(r.media); collect(r.data);
            if (Array.isArray(r.result)) r.result.forEach(collect);
            if (Array.isArray(r.downloads)) r.downloads.forEach(collect);
          }
          if (urls.length) return [...new Set(urls)];
        } catch (e) {}
      }
    }
  } catch (e) {}
  throw new Error('Média Instagram introuvable');
}

async function fbDownload(url) {
  try {
    const { fbdown } = require('btch-downloader');
    const r = await fbdown(url);
    const video = pickFirst(r && r.HD, r && r.hd, r && r.Normal_video, r && r.sd, r && r.url, r && r.video, r && r.result);
    if (video) return video;
  } catch (e) {}
  try {
    const c = require('@coflyn/scrapr');
    if (c.facebook && typeof c.facebook === 'object') {
      for (const fn of Object.values(c.facebook)) {
        if (typeof fn !== 'function') continue;
        try { const r = await fn(url); const v = pickFirst(r); if (v) return v; } catch (e) {}
      }
    }
  } catch (e) {}
  throw new Error('Vidéo Facebook introuvable');
}

async function twitterDownload(url) {
  // coflyn-scrapr first (gave results)
  try {
    const c = require('@coflyn/scrapr');
    const methods = ['tweeload', 'tvd', 'savetwt', 'direct'];
    for (const m of methods) {
      if (c.twitter && typeof c.twitter[m] === 'function') {
        try {
          const r = await c.twitter[m](url);
          const urls = [];
          const push = (x) => { const u = pickFirst(x); if (u) urls.push(u); };
          if (r) {
            push(r.url); push(r.result); push(r.downloads); push(r.media);
            if (r.result && Array.isArray(r.result.downloads)) r.result.downloads.forEach(push);
            if (Array.isArray(r.downloads)) r.downloads.forEach(push);
          }
          if (urls.length) return { url: urls[0], urls: [...new Set(urls)], raw: r };
        } catch (e) {}
      }
    }
  } catch (e) {}
  try {
    const { twitter } = require('btch-downloader');
    const r = await twitter(url);
    const video = pickFirst(r && r.HD, r && r.hd, r && r.url, r && r.video, r && r.result);
    if (video) return { url: video, urls: [video], raw: r };
  } catch (e) {}
  throw new Error('Média Twitter/X introuvable');
}

async function mediafireDownload(url) {
  const { mediafire } = require('btch-downloader');
  const r = await mediafire(url);
  const dl = pickFirst(r && r.url, r && r.link, r && r.download, r && r.result);
  if (!dl) throw new Error('Fichier Mediafire introuvable');
  return { url: dl, filename: r && (r.filename || r.name || r.title) };
}

async function gdriveDownload(url) {
  const { gdrive } = require('btch-downloader');
  const r = await gdrive(url);
  const dl = pickFirst(r && r.data, r && r.url, r && r.download, r && r.result);
  if (!dl) throw new Error('Fichier Google Drive introuvable');
  return { url: dl, filename: (r && (r.filename || r.name)) || (typeof r?.data === 'object' && r.data.filename) };
}

async function spotifyDownload(query) {
  // btch works well with direct track URL
  try {
    const { spotify } = require('btch-downloader');
    const r = await spotify(query);
    if (r && r.status !== false) {
      const audio = pickFirst(r && r.result && r.result.formats, r && r.result && r.result.url, r && r.url, r && r.download, r && r.mp3);
      if (audio) return { title: (r.result && r.result.title) || r.title || 'Spotify', thumbnail: (r.result && r.result.thumbnail) || r.thumbnail, audio };
    }
  } catch (e) {}
  // coflyn-scrapr
  try {
    const c = require('@coflyn/scrapr');
    const methods = ['spotmate', 'spotidown', 'soundloaders', 'spotisaver'];
    for (const m of methods) {
      if (c.spotify && typeof c.spotify[m] === 'function') {
        try {
          const r = await c.spotify[m](query);
          const audio = pickFirst(r && r.result && r.result.downloads, r && r.result && r.result.url, r && r.downloads, r && r.url);
          const title = (r && r.result && r.result.title) || r && r.title;
          const thumbnail = (r && r.result && r.result.thumbnail) || r && r.thumbnail;
          if (audio) return { title: title || 'Spotify', thumbnail, audio };
        } catch (e) {}
      }
    }
  } catch (e) {}
  throw new Error('Résultat Spotify introuvable');
}

async function soundcloudDownload(url) {
  // coflyn-scrapr klickaud gave real mp3
  try {
    const c = require('@coflyn/scrapr');
    if (c.soundcloud && typeof c.soundcloud.klickaud === 'function') {
      const r = await c.soundcloud.klickaud(url);
      const audio = pickFirst(r && r.result && r.result.downloads, r && r.downloads, r && r.url, r && r.result && r.result.url);
      const title = (r && r.result && r.result.title) || r && r.title;
      const thumbnail = (r && r.result && r.result.thumbnail) || r && r.thumbnail;
      if (audio) return { title: title || 'SoundCloud', thumbnail, audio };
    }
  } catch (e) {}
  try {
    const { soundcloud } = require('btch-downloader');
    const r = await soundcloud(url);
    const audio = pickFirst(r && r.result && r.result.audio, r && r.result && r.result.downloadMp3, r && r.url, r && r.download, r && r.mp3);
    if (audio) return { title: (r.result && r.result.title) || r.title, thumbnail: (r.result && r.result.thumbnail) || r.thumbnail, audio };
  } catch (e) {}
  throw new Error('Audio SoundCloud introuvable');
}

module.exports = {
  downloadBuffer,
  ytDownload,
  tiktokDownload,
  igDownload,
  fbDownload,
  twitterDownload,
  mediafireDownload,
  gdriveDownload,
  spotifyDownload,
  soundcloudDownload
};
