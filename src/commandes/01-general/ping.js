'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'ping',
  category: 'general',
  description: 'Teste la latence du bot',
  async execute(sock, m, from) {
    const latency = Date.now() - (Number(m.messageTimestamp) * 1000);
    await sock.sendMessage(from, {
      text: style.renderSuccess(['Pong !', `Latence : ${latency} ms`])
    });
  }
};