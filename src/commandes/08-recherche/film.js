'use strict';
const style = require('../../config/style');

async function fetchJson(url) {
  const res = await fetch(url);
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

async function lookup(key, title) {
  const url = 'https://www.omdbapi.com/?apikey=' + encodeURIComponent(key)
    + '&t=' + encodeURIComponent(title)
    + '&plot=short';
  return (await fetchJson(url)).data;
}

module.exports = {
  name: 'film',
  aliases: ['movie', 'imdb'],
  category: 'recherche',
  description: 'Infos d\'un film ou d\'une serie (OMDb)',
  async execute(sock, m, from, args) {
    const query = args.join(' ').trim();
    if (!query) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .film <titre>']) });

    const key = process.env.OMDB_API_KEY;
    if (!key) return sock.sendMessage(from, { text: style.renderError(['Cle OMDB absente dans .env.']) });

    try {
      let data = await lookup(key, query);

      // Pas de correspondance exacte : on cherche puis on reprend le 1er resultat.
      if (data && data.Response === 'False') {
        const search = await fetchJson('https://www.omdbapi.com/?apikey=' + encodeURIComponent(key)
          + '&s=' + encodeURIComponent(query));
        const first = search.data && search.data.Search && search.data.Search[0];
        if (first) data = await lookup(key, first.Title);
      }

      if (!data || data.Response === 'False') {
        return sock.sendMessage(from, { text: style.renderError([(data && data.Error) || 'Film introuvable.']) });
      }

      const rows = [
        'Titre : ' + data.Title,
        'Type : ' + data.Type,
        'Annee : ' + data.Year,
        'Genre : ' + data.Genre,
        'Duree : ' + data.Runtime,
        'Note : ' + data.imdbRating + '/10',
        'Realisateur : ' + data.Director,
        'Acteurs : ' + data.Actors,
        'Synopsis : ' + data.Plot
      ].map((line) => line.replace(/: N\/A/g, ': ?'));

      const caption = style.box('FILM · ' + String(data.Title).slice(0, 20), rows);
      const poster = data.Poster && data.Poster !== 'N/A' ? data.Poster : null;

      if (poster) {
        try {
          return await sock.sendMessage(from, { image: { url: poster }, caption });
        } catch (e) {
          console.error('[film] affiche indisponible:', e.message);
        }
      }

      await sock.sendMessage(from, { text: caption });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError(['Erreur film : ' + e.message]) });
    }
  }
};
