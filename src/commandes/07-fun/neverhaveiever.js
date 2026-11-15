'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'neverhaveiever',
  aliases: ['nhie'],
  category: 'fun',
  description: 'Je n\'ai jamais...',
  async execute(sock, m, from) {
    const statements = [
      'Je n\'ai jamais menti sur mon age.',
      'Je n\'ai jamais vole quelque chose.',
      'Je n\'ai jamais fait semblant d\'etre malade pour eviter l\'ecole.',
      'Je n\'ai jamais chante sous la douche.',
      'Je n\'ai jamais pleure devant un film.'
    ];
    const s = statements[Math.floor(Math.random() * statements.length)];
    await sock.sendMessage(from, { text: style.renderInfo([s]) });
  }
};
