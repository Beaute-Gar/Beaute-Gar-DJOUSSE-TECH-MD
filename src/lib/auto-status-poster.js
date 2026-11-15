'use strict';

/**
 * auto-status-poster.js — publication automatique de statuts WhatsApp.
 *
 * Publie des statuts (texte ou image + legende) recuperes depuis internet :
 *   - citations d'amour, tristes, motivantes
 *   - images aleatoires avec legende
 *
 * Les statuts sont publies periodiquement (toutes les 2-4h) et au demarrage.
 * Desactivable avec AUTO_STATUS=false dans .env.
 */

const { fetch } = global;

const QUOTE_SOURCES = [
  // Citations motivantes
  async () => {
    const res = await fetch('https://zenquotes.io/api/random');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const q = data && data[0];
    if (!q || !q.q) throw new Error('pas de citation');
    return { text: `💪 ${q.q}\n\n— ${q.a}`, category: 'motivation' };
  },
  // Citations d'amour
  async () => {
    const res = await fetch('https://api.quotable.io/random?tags=love');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data || !data.content) throw new Error('pas de citation');
    return { text: `❤️ ${data.content}\n\n— ${data.author}`, category: 'amour' };
  },
  // Citations de sagesse / inspiration
  async () => {
    const res = await fetch('https://api.quotable.io/random?tags=inspirational');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data || !data.content) throw new Error('pas de citation');
    return { text: `✨ ${data.content}\n\n— ${data.author}`, category: 'inspiration' };
  },
  // Citations tristes / melancoliques
  async () => {
    const res = await fetch('https://api.quotable.io/random?tags=sadness');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data || !data.content) throw new Error('pas de citation');
    return { text: `💔 ${data.content}\n\n— ${data.author}`, category: 'triste' };
  },
  // Citations de bonheur
  async () => {
    const res = await fetch('https://api.quotable.io/random?tags=happiness');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data || !data.content) throw new Error('pas de citation');
    return { text: `😊 ${data.content}\n\n— ${data.author}`, category: 'bonheur' };
  },
];

// Images aleatoires (sans cle API)
const IMAGE_SOURCES = [
  'https://picsum.photos/800/800',
  'https://picsum.photos/800/600',
  'https://picsum.photos/600/800',
];

function enabled() {
  return String(process.env.AUTO_STATUS || 'on').toLowerCase() !== 'off';
}

/**
 * Recupere la liste des destinataires pour le statut.
 * Utilise les participants des groupes du bot + le propre numero du bot.
 */
async function getRecipients(sock) {
  const recipients = new Set();
  // Le propre numero du bot
  const botJid = sock.user?.id?.split(':')[0] + '@s.whatsapp.net';
  if (botJid) recipients.add(botJid);

  // Participants des groupes
  try {
    const groups = await sock.groupFetchAllParticipating();
    for (const g of Object.values(groups || {})) {
      for (const p of (g.participants || [])) {
        if (p.id) recipients.add(p.id);
      }
    }
  } catch (e) { /* ignore */ }

  return [...recipients];
}

async function fetchQuote() {
  const src = pick(QUOTE_SOURCES);
  try {
    return await src();
  } catch (e) {
    console.error('[auto-status] citation indisponible:', e.message);
    // Secours local
    const fallbacks = [
      { text: '💪 La persévérance est la clé du succès.\n\n— Anonyme', category: 'motivation' },
      { text: '❤️ L\'amour est la seule chose qui grandit quand on la partage.\n\n— Anonyme', category: 'amour' },
      { text: '✨ Chaque jour est une nouvelle chance de réussir.\n\n— Anonyme', category: 'inspiration' },
      { text: '💔 Les larmes sont les mots que le cœur ne peut pas dire.\n\n— Anonyme', category: 'triste' },
      { text: '😊 Le bonheur n\'est pas une destination, c\'est une façon de voyager.\n\n— Anonyme', category: 'bonheur' },
    ];
    return pick(fallbacks);
  }
}

async function fetchImage() {
  const url = pick(IMAGE_SOURCES);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = await res.arrayBuffer();
    return Buffer.from(buf);
  } catch (e) {
    console.error('[auto-status] image indisponible:', e.message);
    return null;
  }
}

/**
 * Publie un statut. Alterne entre texte seul et image + legende.
 * @param {object} sock - socket Baileys
 */
async function postStatus(sock) {
  if (!enabled()) return;
  if (!sock || !sock.user) return;

  const quote = await fetchQuote();
  const useImage = Math.random() < 0.5;
  const recipients = await getRecipients(sock);
  const statusJidList = recipients.length > 0 ? recipients : undefined;

  try {
    if (useImage) {
      const img = await fetchImage();
      if (img) {
        await sock.sendMessage('status@broadcast', {
          image: img,
          caption: quote.text
        }, { statusJidList });
        console.log('[auto-status] statut image publie (' + quote.category + ') pour ' + recipients.length + ' destinataires');
        return;
      }
    }
    // Texte seul (ou image indisponible)
    await sock.sendMessage('status@broadcast', {
      text: quote.text
    }, { statusJidList });
    console.log('[auto-status] statut texte publie (' + quote.category + ') pour ' + recipients.length + ' destinataires');
  } catch (e) {
    console.error('[auto-status] publication impossible:', e.message);
  }
}

/**
 * Demarre la publication automatique.
 * @param {object} sock - socket Baileys
 */
function start(sock) {
  if (!enabled()) return;
  if (!sock) return;

  // Premier statut apres 30s (laisser le temps a la connexion de se stabiliser)
  setTimeout(() => postStatus(sock).catch(() => {}), 30000);

  // Puis toutes les 2-4 heures (aleatoire pour paraitre naturel)
  const scheduleNext = () => {
    const delay = (2 + Math.random() * 2) * 3600000; // 2-4h
    setTimeout(() => {
      postStatus(sock).catch(() => {});
      scheduleNext();
    }, delay);
  };
  scheduleNext();
}

module.exports = { postStatus, start, enabled };
