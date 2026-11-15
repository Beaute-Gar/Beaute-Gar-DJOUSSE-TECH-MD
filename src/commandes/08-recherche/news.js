'use strict';
const style = require('../../config/style');

const CATEGORIES = {
  general: 'general', actu: 'general', actus: 'general',
  monde: 'world', world: 'world',
  nation: 'nation', national: 'nation',
  business: 'business', eco: 'business', economie: 'business',
  tech: 'technology', technologie: 'technology', technology: 'technology',
  divertissement: 'entertainment', entertainment: 'entertainment', cinema: 'entertainment',
  sport: 'sports', sports: 'sports',
  science: 'science', sante: 'health', health: 'health'
};

const LANGS = ['fr', 'en', 'es', 'de', 'it', 'pt', 'ar', 'hi', 'zh', 'ja', 'ko', 'ru'];

async function viaGNews(category, lang, max) {
  const key = process.env.GNEWS_API_KEY;
  if (!key) return null;

  const url = 'https://gnews.io/api/v4/top-headlines'
    + '?category=' + encodeURIComponent(category)
    + '&lang=' + encodeURIComponent(lang)
    + '&max=' + max
    + '&apikey=' + encodeURIComponent(key);

  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || !Array.isArray(data.articles) || !data.articles.length) {
    const detail = (data && data.errors && data.errors[0]) || ('HTTP ' + res.status);
    throw new Error(detail);
  }
  return data.articles.map((a) => '• ' + a.title + ' — ' + ((a.source && a.source.name) || ''));
}

// Repli sans cle : flux RSS gratuit.
async function viaRss() {
  const res = await fetch('https://www.francetvinfo.fr/titres.rss');
  const xml = await res.text();
  return [...xml.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g)]
    .map((x) => x[1])
    .filter((t) => t !== 'Franceinfo')
    .slice(0, 5);
}

module.exports = {
  name: 'news',
  aliases: ['actu'],
  category: 'recherche',
  description: 'Dernieres actualites (GNews, repli RSS)',
  async execute(sock, m, from, args = []) {
    const catArg = (args[0] || 'general').toLowerCase();
    const category = CATEGORIES[catArg] || 'general';
    const langArg = (args[1] || 'fr').toLowerCase();
    const lang = LANGS.includes(langArg) ? langArg : 'fr';

    let lines = null;
    let source = 'GNews';

    try {
      lines = await viaGNews(category, lang, 5);
    } catch (e) {
      console.error('[news] GNews indisponible:', e.message);
    }

    if (!lines || !lines.length) {
      try {
        lines = await viaRss();
        source = 'France Info (RSS)';
      } catch (e) {
        console.error('[news] RSS indisponible:', e.message);
      }
    }

    if (!lines || !lines.length) {
      return sock.sendMessage(from, { text: style.renderError(['Impossible de recuperer les actualites.']) });
    }

    await sock.sendMessage(from, {
      text: style.box('ACTUALITES · ' + category.toUpperCase(), [...lines, 'Source : ' + source])
    });
  }
};
