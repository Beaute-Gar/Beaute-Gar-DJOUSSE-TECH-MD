'use strict';

/**
 * sticker.js (lib) — conversions vers le format sticker WhatsApp.
 *  - image  : sharp, 512x512, fond transparent
 *  - video  : ffmpeg, webp anime, 6 s max, 15 i/s
 */

let sharp;
try { sharp = require('sharp'); } catch (e) { /* retire en mobile */ }
const { spawn } = require('child_process');
let ffmpegPath;
try { ffmpegPath = require('ffmpeg-static'); } catch (e) { /* retire en mobile */ }

const SIZE = 512;
const MAX_SECONDS = 6;
const FPS = 15;

async function imageToSticker(buffer) {
  return sharp(buffer)
    .resize(SIZE, SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .webp({ quality: 80, effort: 4 })
    .toBuffer();
}

function runFfmpeg(args, input, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      return reject(new Error('ffmpeg introuvable'));
    }

    const ff = spawn(ffmpegPath, args, { windowsHide: true });
    const out = [];
    const err = [];

    const timer = setTimeout(() => {
      try { ff.kill('SIGKILL'); } catch (e) {}
      reject(new Error('conversion trop longue'));
    }, timeoutMs);

    ff.stdout.on('data', (d) => out.push(d));
    ff.stderr.on('data', (d) => err.push(d));
    ff.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    ff.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && out.length) {
        return resolve(Buffer.concat(out));
      }
      const detail = Buffer.concat(err).toString().trim().slice(0, 300);
      reject(new Error(detail || `ffmpeg a echoue (code ${code})`));
    });

    ff.stdin.on('error', () => {});
    ff.stdin.end(input);
  });
}

async function videoToSticker(buffer) {
  const filter = [
    `scale=${SIZE}:${SIZE}:force_original_aspect_ratio=decrease`,
    `pad=${SIZE}:${SIZE}:(ow-iw)/2:(oh-ih)/2:color=black@0`,
    `fps=${FPS}`
  ].join(',');

  return runFfmpeg([
    '-hide_banner',
    '-loglevel', 'error',
    '-i', 'pipe:0',
    '-t', String(MAX_SECONDS),
    '-vf', filter,
    '-an',
    '-vcodec', 'libwebp',
    '-lossless', '0',
    '-q:v', '55',
    '-loop', '0',
    '-preset', 'default',
    '-f', 'webp',
    'pipe:1'
  ], buffer);
}

module.exports = { imageToSticker, videoToSticker };
