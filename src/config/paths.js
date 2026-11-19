'use strict';
const path = require('path');

const MOBILE = process.env.MOBILE === '1';
const BOT_DATA_DIR = process.env.BOT_DATA_DIR || null;

module.exports = {
  root:       path.resolve(__dirname, '../..'),
  commandes:  path.resolve(__dirname, '../commandes'),
  storage:    MOBILE && BOT_DATA_DIR ? path.join(BOT_DATA_DIR, 'storage') : path.resolve(__dirname, '../../storage'),
  sessions:   MOBILE && BOT_DATA_DIR ? path.join(BOT_DATA_DIR, 'storage', 'sessions') : path.resolve(__dirname, '../../storage/sessions'),
  database:   MOBILE && BOT_DATA_DIR ? path.join(BOT_DATA_DIR, 'storage', 'database') : path.resolve(__dirname, '../../storage/database'),
  downloads:  MOBILE && BOT_DATA_DIR ? path.join(BOT_DATA_DIR, 'storage', 'downloads') : path.resolve(__dirname, '../../storage/downloads')
};