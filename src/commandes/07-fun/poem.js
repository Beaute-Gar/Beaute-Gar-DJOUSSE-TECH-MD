'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'poem',
  aliases: ['poeme'],
  category: 'fun',
  description: 'Genere un court poeme',
  async execute(sock, m, from) {
    const poems = [
      'Les etoiles brillent dans le ciel,\nLa nuit est douce et irréelle,\nUn souffle leger dans les branches,\nLa nature se repose le dimanche.',
      'Le vent murmure des secrets,\nSur les toits de la ville endormie,\nUn chat traverse la rue en silence,\nEt le monde retient son souffle.',
      'Dans le silence de la nuit,\nUne plume ecrit doucement,\nLes mots dansent sur le papier,\nComme des ombres sur l\'eau.'
    ];
    const p = poems[Math.floor(Math.random() * poems.length)];
    await sock.sendMessage(from, { text: style.renderInfo([p]) });
  }
};
