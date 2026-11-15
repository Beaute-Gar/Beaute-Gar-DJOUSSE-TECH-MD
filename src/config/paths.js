'use strict';
const path = require('path');

module.exports = {
  root:       path.resolve(__dirname, '../..'),
  commandes:  path.resolve(__dirname, '../commandes'),
  storage:    path.resolve(__dirname, '../../storage'),
  sessions:   path.resolve(__dirname, '../../storage/sessions'),
  database:   path.resolve(__dirname, '../../storage/database'),
  downloads:  path.resolve(__dirname, '../../storage/downloads')
};