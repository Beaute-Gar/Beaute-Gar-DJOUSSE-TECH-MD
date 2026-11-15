'use strict';
const style = require('../../config/style');

async function serper(query) {
  const key = process.env.SERPER_API_KEY;
  if (!key) return null;

  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'content-type': 'application/json' },
    body: JSON.stringify({ q: query, num: 5, gl: 'fr', hl: 'fr' })
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data && (data.message || data.error)) || ('HTTP ' + res.status));
  return data;
}

module.exports = {
  name: 'google',
  aliases: ['search'],
  category: 'recherche',
  description: 'Recherche Google avec resultats (Serper)',
  async execute(sock, m, from, args) {
    const query = args.join(' ').trim();
    if (!query) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .google <recherche>']) });

    try {
      const data = await serper(query);
      const organic = (data && data.organic) || [];

      if (organic.length) {
        const lines = [];
        if (data.answerBox && data.answerBox.answer) {
          lines.push('│✦ Reponse : ' + data.answerBox.answer);
        }
        organic.slice(0, 5).forEach((r, i) => {
          lines.push('│✦ ' + (i + 1) + '. ' + r.title);
          if (r.snippet) lines.push('│  ' + r.snippet);
          if (r.link) lines.push('│  ' + r.link);
        });
        return sock.sendMessage(from, { text: style.buildFrame('RECHERCHE', lines) });
      }
    } catch (e) {
      console.error('[google] Serper indisponible:', e.message);
    }

    // Repli sans cle : simple lien de recherche.
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    await sock.sendMessage(from, { text: style.renderInfo([`Lien de recherche : ${url}`]) });
  }
};
