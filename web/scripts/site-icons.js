'use strict';
/**
 * web/scripts/site-icons.js — génère les icônes PWA du site (public/assets/icons/)
 * ─────────────────────────────────────────────────────────────────────────────
 * Source : public/assets/logo.svg (charte verte #25d366 / #0e9f4f / #04140c).
 *
 *   icon-192.png · icon-512.png   icônes classiques (tuile arrondie du SVG)
 *   maskable-512.png              icône « maskable » plein cadre (safe zone)
 *   apple-touch-icon.png          iOS (180, plein cadre, sans transparence)
 *   favicon-32.png                favicon raster de secours
 *
 * Usage : node web/scripts/site-icons.js
 * Dépendance : `sharp`, déjà utilisée par le bot (aucune installation en plus).
 *
 * Le site reste vectoriel (logo.svg) : ces PNG servent au manifeste PWA,
 * à l'installation Android et au wrapping APK (TWA/Capacitor).
 */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const PUB = path.join(__dirname, '..', 'public');
const SVG = fs.readFileSync(path.join(PUB, 'assets', 'logo.svg'));
const OUT = path.join(PUB, 'assets', 'icons');

const GREEN_A = '#25d366';
const GREEN_B = '#0e9f4f';

/** Fond carré en dégradé (maskable / iOS : aucun coin transparent). */
function gradientSquare(size) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`
    + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
    + `<stop offset="0" stop-color="${GREEN_A}"/><stop offset="1" stop-color="${GREEN_B}"/>`
    + '</linearGradient></defs>'
    + `<rect width="${size}" height="${size}" fill="url(#g)"/></svg>`,
  );
}

/** Rasterise le logo à la taille demandée (PNG, fond transparent). */
function logoPng(size) {
  return sharp(SVG, { density: 512 }).resize(size, size, { fit: 'contain' }).png().toBuffer();
}

/** Logo réduit et centré sur un fond plein cadre. */
async function onFullBleed(size, scale) {
  const inner = Math.round(size * scale);
  const logo = await logoPng(inner);
  return sharp(gradientSquare(size))
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toBuffer();
}

async function write(name, buffer) {
  fs.writeFileSync(path.join(OUT, name), buffer);
  const meta = await sharp(buffer).metadata();
  const ko = Math.round(fs.statSync(path.join(OUT, name)).size / 1024);
  console.log(`[ICONS] ${name.padEnd(22)} ${meta.width}×${meta.height}  ${ko} Ko ✓`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  await write('icon-192.png', await logoPng(192));
  await write('icon-512.png', await logoPng(512));
  await write('maskable-512.png', await onFullBleed(512, 0.62));
  await write('apple-touch-icon.png', await onFullBleed(180, 0.8));
  await write('favicon-32.png', await logoPng(32));

  // Contrôle d'intégrité : magic bytes PNG + taille annoncée dans le manifeste.
  const expected = { 'icon-192.png': 192, 'icon-512.png': 512, 'maskable-512.png': 512, 'apple-touch-icon.png': 180, 'favicon-32.png': 32 };
  for (const [name, size] of Object.entries(expected)) {
    const file = path.join(OUT, name);
    const buf = fs.readFileSync(file);
    if (!(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)) throw new Error(`${name} : magic bytes PNG invalides`);
    const meta = await sharp(buf).metadata();
    if (meta.width !== size || meta.height !== size) throw new Error(`${name} : ${meta.width}×${meta.height} au lieu de ${size}×${size}`);
  }
  console.log('[ICONS] ✅ 5 icônes générées, tailles et PNG vérifiés');
}

main().catch((error) => {
  console.error(`[ICONS] ❌ ${error.message}`);
  process.exitCode = 1;
});
