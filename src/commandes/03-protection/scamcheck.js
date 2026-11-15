'use strict';
const style = require('../../config/style');

const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+|\b[a-z0-9-]+\.(?:com|net|org|io|me|co|xyz|top|click|link|info|ly|gl|cc|tk|ml|ga|cf|gq|ru|cn)\b[^\s]*)/i;

const SHORTENERS = /(bit\.ly|tinyurl\.com|shorturl\.at|t\.co|goo\.gl|is\.gd|cutt\.ly|rb\.gy|ow\.ly|tiny\.cc|rebrand\.ly|s\.id)/i;
const BAD_TLDS = /\.(xyz|top|click|link|tk|ml|ga|cf|gq|work|loan|zip|mov|icu|buzz|monster)(\/|$|\?|:)/i;
const BAD_WORDS = /(free-?money|win-?prize|click-?here|claim|giveaway|gratuit|gagnez|cadeau|bonus|airdrop|crypto-?double|verify-?account|login-?secure|update-?payment|wallet-?connect|recharge|forfait-?gratuit)/i;
const BRANDS = /(whatsapp|facebook|instagram|paypal|orange|mtn|momo|wave|binance|netflix|amazon|apple|google)/i;

function extractText(m, args) {
  const direct = args.join(' ').trim();
  if (direct) return direct;
  const ctx = m.message?.extendedTextMessage?.contextInfo;
  const q = ctx?.quotedMessage;
  if (!q) return '';
  return q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption || q.videoMessage?.caption || '';
}

module.exports = {
  name: 'scamcheck',
  aliases: ['scanurl'],
  category: 'protection',
  description: 'Analyse un lien suspect',
  async execute(sock, m, from, args) {
    const text = extractText(m, args);
    if (!text) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .scamcheck <url> (ou repondre a un message contenant un lien)']) });

    const match = text.match(URL_REGEX);
    if (!match) return sock.sendMessage(from, { text: style.renderInfo(['Aucun lien detecte.']) });

    const url = match[0];
    let host = '';
    try {
      host = new URL(/^https?:\/\//i.test(url) ? url : `http://${url}`).hostname.toLowerCase();
    } catch (e) {
      return sock.sendMessage(from, { text: style.renderError(['Lien invalide.']) });
    }

    const reasons = [];
    let score = 0;
    const add = (pts, why) => { score += pts; reasons.push(why); };

    if (SHORTENERS.test(host)) add(2, 'Lien raccourci (destination masquee)');
    if (BAD_TLDS.test(host + '/')) add(2, 'Extension de domaine a risque');
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) add(3, 'Adresse IP au lieu d\'un nom de domaine');
    if (host.startsWith('xn--') || host.includes('.xn--')) add(3, 'Domaine punycode (usurpation possible)');
    if (/@/.test(url.replace(/^https?:\/\//i, '').split('/')[0])) add(3, 'Caractere @ dans l\'adresse');
    if (BAD_WORDS.test(url)) add(2, 'Mots-cles typiques d\'arnaque');
    if (host.split('.').length > 4) add(1, 'Trop de sous-domaines');
    if (/^http:\/\//i.test(url)) add(1, 'Connexion non securisee (http)');
    if (BRANDS.test(host) && !new RegExp(`(^|\\.)(${BRANDS.source.slice(1, -1)})\\.(com|net|org|cm)$`, 'i').test(host)) {
      add(3, 'Nom de marque connue dans un domaine non officiel');
    }

    if (score >= 4) {
      return sock.sendMessage(from, {
        text: style.renderError(['Lien TRES suspect. Ne cliquez pas.', `Domaine : ${host}`, ...reasons.map(r => `- ${r}`)])
      });
    }
    if (score >= 2) {
      return sock.sendMessage(from, {
        text: style.renderError(['Lien potentiellement suspect. Prudence.', `Domaine : ${host}`, ...reasons.map(r => `- ${r}`)])
      });
    }
    await sock.sendMessage(from, {
      text: style.renderSuccess(['Aucune alerte detectee.', `Domaine : ${host}`, 'Ceci ne garantit pas que le lien est sur.'])
    });
  }
};