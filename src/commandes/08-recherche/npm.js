'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'npm',
  category: 'recherche',
  description: 'Recherche un package NPM',
  async execute(sock, m, from, args) {
    const pkg = args[0];
    if (!pkg) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .npm <package>']) });

    try {
      const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`);
      if (!res.ok) throw new Error('Package introuvable');
      
      const data = await res.json();
      
      await sock.sendMessage(from, { 
        text: style.box('NPM', [
          `Nom : ${data.name}`,
          `Version : ${data.version}`,
          `Description : ${data.description || 'Aucune'}`
        ]) 
      });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([`Erreur NPM : ${e.message}`]) });
    }
  }
};
