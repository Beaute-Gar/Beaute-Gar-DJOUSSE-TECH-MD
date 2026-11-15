'use strict';

/**
 * logger.js — copie la console dans un journal quotidien.
 * Rotation automatique a la date et suppression des anciens fichiers.
 * L'ecriture ne fait jamais tomber le bot.
 */

const path = require('path');
const util = require('util');
const { createWriteStream, promises: fsp } = require('fs');

let dir = './logs';
let keepDays = 14;
let stream = null;
let day = '';
let installed = false;

async function prune() {
  try {
    const limit = Date.now() - keepDays * 86400000;
    for (const name of await fsp.readdir(dir)) {
      const m = name.match(/^(\d{4}-\d{2}-\d{2})\.log$/);
      if (m && new Date(m[1]).getTime() < limit) {
        await fsp.rm(path.join(dir, name), { force: true }).catch(() => {});
      }
    }
  } catch {
    // dossier absent ou illisible
  }
}

function open() {
  const today = new Date().toISOString().slice(0, 10);
  if (stream && today === day) return;

  if (stream) {
    try { stream.end(); } catch { /* ignore */ }
  }
  day = today;
  stream = createWriteStream(path.join(dir, `${today}.log`), { flags: 'a' });
  stream.on('error', () => {});
  prune();
}

async function installLogger(opts = {}) {
  if (installed) return;
  installed = true;

  dir = opts.dir || dir;
  keepDays = opts.keepDays == null ? keepDays : opts.keepDays;

  await fsp.mkdir(dir, { recursive: true, mode: 0o700 }).catch(() => {});

  for (const level of ['log', 'info', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      original(...args);
      try {
        open();
        stream.write(`${new Date().toISOString()} ${level.toUpperCase()} ${util.format(...args)}\n`);
      } catch {
        // le journal ne doit jamais casser le bot
      }
    };
  }
}

function closeLogger() {
  return new Promise((resolve) => {
    if (!stream) return resolve();
    const s = stream;
    stream = null;
    try { s.end(resolve); } catch { resolve(); }
  });
}

module.exports = { installLogger, closeLogger };
