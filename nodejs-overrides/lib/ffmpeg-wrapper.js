'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let cachedPath = null;

function getFfmpegPath() {
  if (cachedPath) return cachedPath;

  const isAndroid = process.platform === 'android' || process.env.MOBILE === '1';

  const candidates = [];

  if (isAndroid) {
    // 1. Emplacement direct dans les assets Node.js (__dirname/../bin/ffmpeg)
    candidates.push(path.join(__dirname, '..', 'bin', 'ffmpeg'));
    // 2. Chemins absolus de secours sur Android
    candidates.push('/data/user/0/com.djoussetech.md/files/nodejs/public/bin/ffmpeg');
    candidates.push('/data/data/com.djoussetech.md/files/nodejs/public/bin/ffmpeg');
    candidates.push('/data/user/0/com.djoussetech.md/files/ffmpeg');
    candidates.push('/data/data/com.djoussetech.md/files/ffmpeg');
  } else {
    try {
      const staticMod = require('ffmpeg-static');
      if (staticMod && fs.existsSync(staticMod)) {
        cachedPath = staticMod;
        return cachedPath;
      }
    } catch (e) {}
    candidates.push('ffmpeg');
  }

  for (const p of candidates) {
    try {
      if (path.isAbsolute(p) || p.includes(path.sep) || p.includes('/')) {
        if (fs.existsSync(p)) {
          try { fs.chmodSync(p, 0o755); } catch (e) {}
          cachedPath = p;
          console.log('[ffmpeg-wrapper] Trouvé et rendu exécutable :', p);
          return cachedPath;
        }
      } else {
        cachedPath = p;
        return cachedPath;
      }
    } catch (e) {}
  }

  console.warn('[ffmpeg-wrapper] libffmpeg.so introuvable sur cet appareil');
  return null;
}

function runFfmpeg(args, inputBuffer) {
  const binary = getFfmpegPath();
  if (!binary) {
    return Promise.reject(new Error('ffmpeg non disponible sur cet appareil'));
  }
  try {
    fs.chmodSync(binary, 0o755);
  } catch (e) {}
  return new Promise((resolve, reject) => {
    const ff = spawn(binary, args);
    const out = [];
    const err = [];
    ff.stdout.on('data', c => out.push(c));
    ff.stderr.on('data', c => err.push(c));
    if (inputBuffer) {
      try { ff.stdin.write(inputBuffer); ff.stdin.end(); } catch (e) {}
    }
    ff.on('error', e => reject(e));
    ff.on('close', code => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error('ffmpeg exited with code ' + code + ': ' + Buffer.concat(err).toString().slice(-300)));
    });
  });
}

module.exports = {
  getFfmpegPath,
  runFfmpeg
};
