'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'joke',
  aliases: ['blague'],
  category: 'fun',
  description: 'Raconte une blague aleatoire (JokeAPI - gratuit)',
  async execute(sock, m, from) {
    try {
      const res = await fetch('https://v2.jokeapi.dev/joke/Any?lang=fr&blacklistFlags=nsfw,religious,political,racist,sexist,explicit');
      const data = await res.json();
      
      let joke = '';
      if (data.type === 'single') {
        joke = data.joke;
      } else if (data.type === 'twopart') {
        joke = `${data.setup}\n... ${data.delivery}`;
      } else {
        joke = "Desole, je n'ai pas de blague sous la main.";
      }

      await sock.sendMessage(from, { text: style.renderInfo([joke]) });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError(['Impossible de recuperer une blague.']) });
    }
  }
};
