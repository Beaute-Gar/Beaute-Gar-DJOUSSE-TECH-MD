'use strict';
/**
 * web/scripts/site-icons.js — génère les icônes PWA/favicons du site
 * Source : logo racine du projet (logo.jpg/png).
 * Usage : node web/scripts/site-icons.js
 */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..', '..');
const PUB = path.join(__dirname, '..', 'public');
const SRC = path.join(ROOT, 'logo.jpg');
const OUT = path.join(PUB, 'assets', 'icons');

const BG = '#0b1118';

function bgSquare(size) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${BG}"/></svg>`);
}

function logoPng(size) {
  return sharp(SRC).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

async function onFullBleed(size, scale) {
  const inner = Math.round(size * scale);
  const logo = await logoPng(inner);
  return sharp(bgSquare(size)).composite([{ input: logo, gravity: 'center' }]).png().toBuffer();
}

async function write(name, buffer) {
  fs.writeFileSync(path.join(OUT, name), buffer);
  const meta = await sharp(buffer).metadata();
  const ko = Math.round(fs.statSync(path.join(OUT, name)).size / 1024);
  console.log(`[ICONS] ${name.padEnd(22)} ${meta.width}×${meta.height}  ${ko} Ko ✓`);
}

async function main() {
  if (!fs.existsSync(SRC)) throw new Error(`Source introuvable: ${SRC}`);
  fs.mkdirSync(OUT, { recursive: true });

  await write('icon-192.png', await logoPng(192));
  await write('icon-512.png', await logoPng(512));
  await write('maskable-512.png', await onFullBleed(512, 0.72));
  await write('apple-touch-icon.png', await onFullBleed(180, 0.82));
  await write('favicon-32.png', await logoPng(32));

  // favicon.ico (32x32 PNG encapsulé)
  const png32 = fs.readFileSync(path.join(OUT, 'favicon-32.png'));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(32, 0);
  entry.writeUInt8(32, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png32.length, 8);
  entry.writeUInt32LE(22, 12);
  fs.writeFileSync(path.join(PUB, 'favicon.ico'), Buffer.concat([header, entry, png32]));
  console.log('[ICONS] favicon.ico        régénéré ✓');

  const expected = { 'icon-192.png': 192, 'icon-512.png': 512, 'maskable-512.png': 512, 'apple-touch-icon.png': 180, 'favicon-32.png': 32 };
  for (const [name, size] of Object.entries(expected)) {
    const file = path.join(OUT, name);
    const buf = fs.readFileSync(file);
    if (!(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)) throw new Error(`${name} : magic bytes PNG invalides`);
    const meta = await sharp(buf).metadata();
    if (meta.width !== size || meta.height !== size) throw new Error(`${name} : ${meta.width}×${meta.height} au lieu de ${size}×${size}`);
  }
  console.log('[ICONS] ✅ icônes générées depuis le logo projet, tailles vérifiées');
}

main().catch((error) => {
  console.error(`[ICONS] ❌ ${error.message}`);
  process.exitCode = 1;
});
