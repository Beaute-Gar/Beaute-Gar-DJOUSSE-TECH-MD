'use strict';
const style = require('../../config/style');
const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: 'uuid',
  category: 'outils',
  description: 'Genere un identifiant unique UUID v4',
  async execute(sock, m, from) {
    const id = uuidv4();
    await sock.sendMessage(from, { text: style.renderSuccess([`UUID genere : ${id}`]) });
  }
};
