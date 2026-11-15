'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'steal',
  category: 'sticker-media',
  description: 'Vole un sticker (alias de take)',
  async execute(sock, m, from, args) {
    const takeCmd = require('./take');
    await takeCmd.execute(sock, m, from, args);
  }
};
