'use strict';
const style = require('../../config/style');

module.exports = {
  name: 'weather',
  aliases: ['meteo'],
  category: 'outils',
  description: 'Affiche la meteo d\'une ville (ex: .weather Paris)',
  async execute(sock, m, from, args) {
    const city = args.join(' ');
    if (!city) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .weather <ville>']) });

    try {
      // Utilisation de wttr.in (pas de cle API requise)
      const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
      const data = await res.json();

      if (data.current_condition && data.current_condition[0]) {
        const c = data.current_condition[0];
        const temp = c.temp_C;
        const desc = c.weatherDesc[0].value;
        const humidity = c.humidity;
        const wind = c.windspeedKmph;

        await sock.sendMessage(from, { 
          text: style.box('METEO', [
            `Ville : ${city}`,
            `Temp : ${temp}°C`,
            `Temps : ${desc}`,
            `Humidite : ${humidity}%`,
            `Vent : ${wind} km/h`
          ]) 
        });
      } else {
        await sock.sendMessage(from, { text: style.renderError(['Ville introuvable.']) });
      }
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError(['Erreur meteo.']) });
    }
  }
};
