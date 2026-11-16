'use strict';

const { downloadBuffer } = require('./media-download');
const { transcodeToMp3 } = require('./yt-download');

const SUNO_HOST_RE = /(^|\.)suno\.com$/i;

function isSunoUrl(input) {
  try {
    const u = new URL(String(input || '').trim());
    return SUNO_HOST_RE.test(u.hostname) && (/^\/s\//.test(u.pathname) || /^\/song\//.test(u.pathname));
  } catch (e) {
    return false;
  }
}

function extractSunoId(url) {
  const s = String(url || '');
  let m = s.match(/suno\.com\/song\/([a-f0-9-]{36})/i);
  if (m) return m[1];
  m = s.match(/[?&]id=([a-f0-9-]{36})/i);
  if (m) return m[1];
  return null;
}

function pickMediaUrl(data) {
  if (!data) return null;
  const urls = Array.isArray(data.media_urls) ? data.media_urls : [];
  const prog = urls.filter(x => x && x.url && (x.delivery === 'progressive' || !x.delivery));
  const prefer = prog.find(x => /mp3/i.test(String(x.content_type || x.url)))
    || prog.find(x => /m4a|aac|audio|mpeg|opus|ogg/i.test(String(x.content_type || x.url)))
    || prog[0] || urls[0];
  if (prefer && prefer.url) return { url: String(prefer.url).replace(/\\\//g, '/'), contentType: String(prefer.content_type || '') };
  const au = String(data.audio_url || '').replace(/\\\//g, '/');
  if (/^https?:\/\//i.test(au) && !/\/api\/forbidden/i.test(au)) return { url: au, contentType: '' };
  return null;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8'
    },
    redirect: 'follow'
  });
  if (!res.ok) throw new Error(`Suno HTTP ${res.status}`);
  return { text: await res.text(), finalUrl: res.url };
}

function tryJsonParse(s) {
  try { return JSON.parse(s); } catch (e) {}
  try { return JSON.parse(s.replace(/\\\//g, '/')); } catch (e) {}
  return null;
}

function extractFromHtml(html, knownId) {
  const raw = String(html || '');
  // Next.js RSC payload often escapes quotes; create a lightly unescaped view for matching
  const text = raw.replace(/\\"/g, '"').replace(/\\\//g, '/').replace(/\\n/g, '\n');

  const searchId = knownId || '';
  let title = '';
  let artist = '';
  let media_urls = [];
  let audio_url = '';

  // Try to parse a JSON object fragment around the known clip id
  if (searchId) {
    const idx = text.indexOf(searchId);
    if (idx !== -1) {
      // find nearest preceding '{' and attempt to balance braces to get object
      let start = text.lastIndexOf('{', idx);
      if (start !== -1) {
        let depth = 0, end = -1;
        for (let i = start; i < Math.min(text.length, start + 200000); i++) {
          const ch = text[i];
          if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (depth === 0) { end = i + 1; break; }
          }
        }
        if (end > start) {
          const obj = tryJsonParse(text.slice(start, end));
          if (obj && typeof obj === 'object') {
            title = String(obj.title || obj.name || '');
            artist = String(obj.display_name || obj.artist || obj.username || '');
            if (Array.isArray(obj.media_urls)) media_urls = obj.media_urls;
            if (obj.audio_url) audio_url = String(obj.audio_url);
            if ((!title || !media_urls.length) && obj.clip && typeof obj.clip === 'object') {
              title = title || String(obj.clip.title || '');
              artist = artist || String(obj.clip.display_name || '');
              if (!media_urls.length && Array.isArray(obj.clip.media_urls)) media_urls = obj.clip.media_urls;
              audio_url = audio_url || String(obj.clip.audio_url || '');
            }
          }
        }
      }
    }
  }

  if (!media_urls.length) {
    const m2 = text.match(/"media_urls"\s*:\s*(\[(?:[^\[\]]|\[(?:[^\[\]]|\[[^\[\]]*\])*\])*\])/);
    if (m2) {
      const parsed = tryJsonParse(m2[1]);
      if (Array.isArray(parsed)) media_urls = parsed;
    }
  }
  if (!audio_url) {
    const am = text.match(/"audio_url"\s*:\s*"([^"]*)"/);
    if (am) audio_url = am[1];
  }
  if (!title) {
    // prefer a title that looks like song title near clip markers
    const candidates = [...text.matchAll(/"title"\s*:\s*"([^"]{1,120})"/g)].map(x => x[1]);
    title = candidates.find(t => t && !/full app experience|get the app|suno/i.test(t)) || candidates[0] || '';
  }
  if (!artist) {
    const dm = text.match(/"display_name"\s*:\s*"([^"]{1,80})"/);
    if (dm) artist = dm[1];
  }

  return { title: String(title || '').trim(), media_urls, audio_url: String(audio_url || ''), artist: String(artist || '').trim() };
}

async function resolveSuno(url) {
  const input = String(url || '').trim();
  if (!isSunoUrl(input)) throw new Error('Lien Suno invalide');

  const { text: html, finalUrl } = await fetchText(input);
  const id = extractSunoId(finalUrl) || extractSunoId(input);
  const data = extractFromHtml(html, id);

  let title = data.title || (id ? `Suno ${id.slice(0, 8)}` : 'Suno');
  if (data.artist && !new RegExp(data.artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(title)) {
    title = `${title} - ${data.artist}`.trim();
  }

  const picked = pickMediaUrl(data);
  if (!picked) throw new Error('Audio Suno introuvable sur la page');

  const buf = await downloadBuffer(picked.url, 'https://suno.com/');
  if (!buf || !buf.length) throw new Error('Téléchargement Suno échoué');

  let out = buf;
  let ext = 'mp3';
  let mimetype = 'audio/mpeg';
  const ct = (picked.contentType || '').toLowerCase();
  const urlLower = picked.url.toLowerCase();
  const isMp3 = /mpeg|mp3/.test(ct) || urlLower.includes('.mp3');
  const isM4a = /m4a|mp4|aac/.test(ct) || urlLower.includes('.m4a') || urlLower.includes('.mp4');
  if (isMp3) {
    ext = 'mp3';
    mimetype = 'audio/mpeg';
  } else if (isM4a) {
    ext = 'm4a';
    mimetype = 'audio/mp4';
  } else {
    // try to convert uncommon formats (opus/ogg/webm) to mp3 for compatibility
    try {
      const converted = await transcodeToMp3(buf);
      if (converted && converted.length) out = converted;
      ext = 'mp3';
      mimetype = 'audio/mpeg';
    } catch (e) {
      ext = /opus|ogg/.test(ct) ? 'ogg' : 'm4a';
      mimetype = /opus|ogg/.test(ct) ? 'audio/ogg; codecs=opus' : 'audio/mp4';
    }
  }

  return {
    buffer: out,
    title,
    id,
    url: finalUrl || input,
    ext,
    mimetype,
    thumbnail: id ? `https://cdn2.suno.ai/image_large_${id}.jpeg` : null,
    source: 'suno'
  };
}

async function sunoAudio(url) {
  const info = await resolveSuno(url);
  return {
    ...info,
    quality: 'Suno',
    duration: { seconds: 0, timestamp: '' }
  };
}

module.exports = { isSunoUrl, resolveSuno, sunoAudio };
