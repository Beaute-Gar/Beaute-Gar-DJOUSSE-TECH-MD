'use strict';

/**
 * sticker.js (lib) — conversions vers le format sticker WhatsApp (WebP 512x512).
 * Utilise ffmpeg-kit pour convertir images et vidéos sans dépendre de sharp.
 */

const { runFfmpeg, getFfmpegPath } = require('../../lib/ffmpeg-wrapper');
const fs = require('fs');
const os = require('os');
const path = require('path');
const compatPaths = require('../compat/paths');

const SIZE = 512;
const MAX_SECONDS = 6;
const FPS = 15;

function isAvailable() {
  return !!getFfmpegPath();
}

async function imageToSticker(buffer) {
  const binary = getFfmpegPath();
  if (!binary) throw new Error('ffmpeg non disponible sur cet appareil');

  const stamp = Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const tmpIn = path.join(compatPaths.tmpdir(), `stk_img_in_${stamp}`);
  const tmpOut = path.join(compatPaths.tmpdir(), `stk_img_out_${stamp}.webp`);

  try {
    fs.writeFileSync(tmpIn, buffer);
    await runFfmpeg([
      '-y',
      '-i', tmpIn,
      '-vf', `scale=${SIZE}:${SIZE}:force_original_aspect_ratio=decrease,pad=${SIZE}:${SIZE}:(ow-iw)/2:(oh-ih)/2:color=black@0`,
      '-c:v', 'libwebp',
      '-vframes', '1',
      '-lossless', '0',
      '-q:v', '70',
      tmpOut
    ]);
    return fs.readFileSync(tmpOut);
  } finally {
    try { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn); } catch (e) {}
    try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch (e) {}
  }
}

async function videoToSticker(buffer) {
  const binary = getFfmpegPath();
  if (!binary) throw new Error('ffmpeg non disponible sur cet appareil');

  const stamp = Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const tmpIn = path.join(compatPaths.tmpdir(), `stk_vid_in_${stamp}`);
  const tmpOut = path.join(compatPaths.tmpdir(), `stk_vid_out_${stamp}.webp`);

  try {
    fs.writeFileSync(tmpIn, buffer);
    const filter = [
      `scale=${SIZE}:${SIZE}:force_original_aspect_ratio=decrease`,
      `pad=${SIZE}:${SIZE}:(ow-iw)/2:(oh-ih)/2:color=black@0`,
      `fps=${FPS}`
    ].join(',');

    await runFfmpeg([
      '-y',
      '-i', tmpIn,
      '-t', String(MAX_SECONDS),
      '-vf', filter,
      '-an',
      '-c:v', 'libwebp',
      '-lossless', '0',
      '-q:v', '55',
      '-loop', '0',
      tmpOut
    ]);
    return fs.readFileSync(tmpOut);
  } finally {
    try { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn); } catch (e) {}
    try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch (e) {}
  }
}

module.exports = {
  isAvailable,
  imageToSticker,
  videoToSticker
};
