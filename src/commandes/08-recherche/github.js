'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'github',
  aliases: ['gh'],
  category: 'recherche',
  description: 'Recherche un utilisateur GitHub',
  async execute(sock, m, from, args) {
    const username = args[0];
    if (!username) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .github <username>']) });

    try {
      const res = await fetch(`https://api.github.com/users/${username}`);
      if (!res.ok) throw new Error('Utilisateur introuvable');
      
      const data = await res.json();
      
      await sock.sendMessage(from, { 
        text: style.box('GITHUB', [
          `Nom : ${data.name || username}`,
          `Bio : ${data.bio || 'Aucune bio'}`,
          `Repos : ${data.public_repos}`,
          `Followers : ${data.followers}`
        ]) 
      });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([`Erreur GitHub : ${e.message}`]) });
    }
  }
};
