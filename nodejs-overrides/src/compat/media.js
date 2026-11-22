'use strict';

/**
 * compat/media.js — moteur de traitement d'image multiplateforme.
 *
 * Les API reellement utilisees dans le projet sont :
 *   - flou            : blur.js       -> sharp(buffer).blur(10).toBuffer()
 *   - redimensionnement / recadrage / conversion : utilises par les librairies
 *     de stickers et a disposition des commandes.
 *
 * Selection :
 *   - PC (Windows/Linux) : sharp si le binaire natif est installable, sinon Jimp.
 *   - Android : sharp 0.35.5 exige Node >= 20.9.0 et n'a pas de binaire
 *     android-arm64/android-x64 -> Jimp (100% JavaScript) prend le relais.
 *
 * Aucun appel n'est fait au chargement du module : les commandes qui utilisent
 * une image ne plantent plus au moment ou `command-loader` les parcourt.
 */

let sharpCandidate = undefined;
let jimpCandidate = undefined;
const failures = [];

function trySharp() {
  if (sharpCandidate !== undefined) return sharpCandidate;
  try {
    const loaded = require('sharp');
    const fn = typeof loaded === 'function' ? loaded : loaded && loaded.default;
    if (typeof fn !== 'function') throw new Error('export sharp invalide');
    sharpCandidate = { name: 'sharp', fn: fn };
  } catch (e) {
    failures.push('sharp: ' + ((e && e.message) || e).split('\n')[0]);
    sharpCandidate = null;
  }
  return sharpCandidate;
}

function tryJimp() {
  if (jimpCandidate !== undefined) return jimpCandidate;
  try {
    const loaded = require('jimp');
    const Jimp = loaded.Jimp || loaded.default || loaded;
    if (typeof Jimp !== 'function') throw new Error('export Jimp invalide');
    jimpCandidate = {
      name: 'jimp',
      Jimp: Jimp,
      mime: loaded.JimpMime || { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }
    };
  } catch (e) {
    failures.push('jimp: ' + ((e && e.message) || e).split('\n')[0]);
    jimpCandidate = null;
  }
  return jimpCandidate;
}

function engines() {
  const out = [];
  const s = trySharp();
  const j = tryJimp();
  if (s) out.push(s);
  if (j) out.push(j);
  return out;
}

function mimeOf(mime, format) {
  const key = String(format || '').toLowerCase().replace(/^jpeg$/, 'jpg');
  if (mime && mime[key]) return mime[key];
  const table = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp' };
  return table[key] || 'image/png';
}

async function run(operation, buffer, options) {
  const tried = [];
  for (const eng of engines()) {
    try {
      const result = eng.name === 'sharp'
        ? await runSharp(eng, operation, buffer, options)
        : await runJimp(eng, operation, buffer, options);
      if (!Buffer.isBuffer(result)) throw new Error('resultat non-Buffer');
      return { engine: eng.name, buffer: result };
    } catch (e) {
      tried.push(eng.name + ': ' + ((e && e.message) || e));
    }
  }
  const detail = tried.length ? tried.join(' | ') : (failures.join(' | ') || 'aucun moteur disponible');
  throw new Error('Traitement d\'image impossible. ' + detail);
}

async function runSharp(eng, operation, buffer, options) {
  const o = options || {};
  let img = eng.fn(buffer);
  switch (operation) {
    case 'blur':
      img = img.blur(Number(o.radius || 10));
      break;
    case 'resize':
      img = img.resize(o.width || null, o.height || null, { fit: o.fit || 'cover' });
      break;
    case 'crop':
      img = img.extract({ left: o.x || 0, top: o.y || 0, width: o.width, height: o.height });
      break;
    case 'convert':
      break;
    default:
      throw new Error('operation inconnue : ' + operation);
  }
  const format = String(o.format || 'png').toLowerCase().replace('jpg', 'jpeg');
  return img.toFormat(format).toBuffer();
}

async function runJimp(eng, operation, buffer, options) {
  const o = options || {};
  const image = await eng.Jimp.read(buffer);
  switch (operation) {
    case 'blur':
      image.blur(Math.max(1, Math.round(Number(o.radius || 10))));
      break;
    case 'resize':
      // Jimp v1 attend un objet { w, h }, pas deux arguments positionnels.
      image.resize({
        w: Math.max(1, Number(o.width || image.bitmap.width)),
        h: Math.max(1, Number(o.height || image.bitmap.height))
      });
      break;
    case 'crop':
      // Jimp v1 attend un objet { x, y, w, h }.
      image.crop({
        x: Math.max(0, Number(o.x || 0)),
        y: Math.max(0, Number(o.y || 0)),
        w: Math.max(1, Number(o.width || 1)),
        h: Math.max(1, Number(o.height || 1))
      });
      break;
    case 'convert':
      break;
    default:
      throw new Error('operation inconnue : ' + operation);
  }
  return image.getBuffer(mimeOf(eng.mime, o.format || 'png'));
}

async function blur(buffer, radius) {
  return run('blur', buffer, { radius: radius == null ? 10 : radius });
}
async function resize(buffer, width, height, options) {
  return run('resize', buffer, Object.assign({ width: width, height: height }, options || {}));
}
async function crop(buffer, x, y, width, height) {
  return run('crop', buffer, { x: x, y: y, width: width, height: height });
}
async function convert(buffer, format) {
  return run('convert', buffer, { format: format || 'png' });
}

function describe() {
  const out = { sharp: 'non charge', jimp: 'non charge' };
  const s = trySharp();
  const j = tryJimp();
  out.sharp = s ? 'disponible' : ('indisponible : ' + (failures.find(f => f.startsWith('sharp:')) || '?'));
  out.jimp = j ? 'disponible' : ('indisponible : ' + (failures.find(f => f.startsWith('jimp:')) || '?'));
  out.selected = s ? 'sharp' : (j ? 'jimp' : 'aucun');
  return out;
}

module.exports = { blur, resize, crop, convert, describe, engines };
