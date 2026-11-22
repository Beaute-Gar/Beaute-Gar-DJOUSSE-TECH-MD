'use strict';

/**
 * compat/globals.js — API Web manquantes sur le Node 18.20.4 embarque.
 *
 * - File : absente avant Node 20. cheerio 1.x -> undici 7 appelle `new File(...)`
 *   des le chargement du module (`ephoto.js` rechargeait mumaker/cheerio et echouait
 *   avec "File is not defined"). On la reconstruit a partir de buffer.Blob/File.
 * - Blob / FormData / fetch : deja presents sur Node 18, on ne les touche que s'ils
 *   manquent, afin de ne pas casser les environnements qui les fournissent.
 * - TextDecoder : le runtime Android est compile sans ICU ; l'option `fatal` leve
 *   ERR_NO_ICU. main.cjs applique deja le shim, cette fonction est idempotente.
 */

let status = null;

function installFile() {
  if (typeof globalThis.File === 'function') return 'deja present';
  let bufferMod;
  try { bufferMod = require('buffer'); } catch (e) { return 'buffer indisponible'; }

  if (typeof bufferMod.File === 'function') {
    globalThis.File = bufferMod.File;
    return 'depuis node:buffer';
  }

  const BlobBase = typeof globalThis.Blob === 'function'
    ? globalThis.Blob
    : (typeof bufferMod.Blob === 'function' ? bufferMod.Blob : null);

  if (!BlobBase) return 'ABSENT (aucun Blob)';

  class FileFallback extends BlobBase {
    constructor(bits, name, options) {
      super(bits || [], options || {});
      this.name = String(name || 'file');
      this.lastModified = Date.now();
    }
    get [Symbol.toStringTag]() { return 'File'; }
  }
  globalThis.File = FileFallback;
  return 'polyfill local (Blob)';
}

function installBlob() {
  if (typeof globalThis.Blob === 'function') return 'deja present';
  try { globalThis.Blob = require('buffer').Blob; return 'depuis node:buffer'; }
  catch (e) { return 'ABSENT'; }
}

function installTextDecoder() {
  if (typeof TextDecoder !== 'function') return 'TextDecoder ABSENT';
  try {
    new TextDecoder('utf-8', { fatal: true });
    return 'fatal supporte';
  } catch (e) {
    const Orig = TextDecoder;
    function Patched(label, options) {
      if (options && options.fatal) {
        options = Object.assign({}, options);
        delete options.fatal;
      }
      return new Orig(label, options);
    }
    Patched.prototype = Orig.prototype;
    globalThis.TextDecoder = Patched;
    return 'shim fatal (' + (e && e.code || 'erreur') + ')';
  }
}

function install() {
  if (status) return status;
  status = {
    File: installFile(),
    Blob: installBlob(),
    TextDecoder: installTextDecoder(),
    TextEncoder: typeof globalThis.TextEncoder === 'function' ? 'deja present' : 'ABSENT',
    fetch: typeof globalThis.fetch === 'function' ? 'deja present' : 'ABSENT',
    FormData: typeof globalThis.FormData === 'function' ? 'deja present' : 'ABSENT'
  };
  return status;
}

module.exports = { install, get status() { return status; } };
