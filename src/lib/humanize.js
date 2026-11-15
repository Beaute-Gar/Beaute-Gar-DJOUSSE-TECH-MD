'use strict';

/**
 * humanize.js — petit frein anti-ban applique a sock.sendMessage.
 *
 * Il ne modifie aucune commande : il enveloppe l'envoi pour :
 *  - ajouter un delai aleatoire avant chaque reponse ;
 *  - afficher « ecrit... » (composing) pendant un temps proportionnel au texte ;
 *  - espacer deux messages dans la meme discussion ;
 *  - plafonner le nombre de messages par minute et par session.
 *
 * Les reactions, editions et suppressions passent sans delai (ce ne sont pas
 * des messages visibles). relayMessage (menu a boutons) n'est pas concerne.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rand = (min, max) => Math.floor(min + Math.random() * (max - min + 1));

const SKIP_KEYS = ['react', 'edit', 'delete', 'forward'];

function isUtilityContent(content) {
  if (!content || typeof content !== 'object') return false;
  return SKIP_KEYS.some((key) => Boolean(content[key]));
}

function textOf(content) {
  if (!content || typeof content !== 'object') return '';
  if (typeof content.text === 'string') return content.text;
  if (typeof content.caption === 'string') return content.caption;
  return '';
}

function humanize(sock, opts = {}) {
  const {
    enabled = true,
    minDelay = 700,
    maxDelay = 1800,
    followUpDelay = 300,
    followUpMaxDelay = 700,
    followUpWindow = 15000,
    typingPerChar = 20,
    minTyping = 400,
    maxTyping = 2500,
    perChatGap = 1200,
    maxPerMinute = 18,
    skipJids = ['status@broadcast']
  } = opts;

  if (!enabled || !sock || typeof sock.sendMessage !== 'function') return sock;
  if (sock.__humanized) return sock;

  const original = sock.sendMessage.bind(sock);
  const chains = new Map();   // jid -> promesse de la file d'attente
  const lastSent = new Map(); // jid -> timestamp du dernier envoi
  const stamps = [];          // timestamps des envois de la derniere minute

  async function waitForQuota() {
    for (;;) {
      const now = Date.now();
      while (stamps.length && now - stamps[0] > 60000) stamps.shift();
      if (stamps.length < maxPerMinute) return;
      const wait = Math.max(250, 60000 - (now - stamps[0]));
      await sleep(wait);
    }
  }

  async function showTyping(jid, text, quick) {
    if (typeof sock.sendPresenceUpdate !== 'function') {
      await sleep(quick ? rand(150, 350) : rand(minTyping, Math.min(maxTyping, minTyping * 2)));
      return;
    }

    const typing = Math.min(
      maxTyping,
      Math.max(minTyping, text.length * typingPerChar)
    );

    try {
      await sock.sendPresenceUpdate('composing', jid);
      await sleep(quick ? Math.min(typing, 900) : typing);
      await sock.sendPresenceUpdate('paused', jid);
    } catch {
      await sleep(250);
    }
  }

  async function run(jid, content, options) {
    await waitForQuota();

    const now = Date.now();
    const previous = lastSent.get(jid) || 0;
    const quick = previous > 0 && now - previous < followUpWindow;

    const base = quick
      ? rand(followUpDelay, followUpMaxDelay)
      : rand(minDelay, maxDelay);
    const gap = Math.max(0, perChatGap - (now - previous));
    await sleep(Math.max(base, gap));

    const text = textOf(content);
    if (!quick || text.length > 0) {
      await showTyping(jid, text, quick);
    }

    stamps.push(Date.now());
    const result = await original(jid, content, options);
    lastSent.set(jid, Date.now());
    return result;
  }

  sock.sendMessage = function humanizedSendMessage(jid, content, options) {
    if (isUtilityContent(content) || skipJids.includes(jid)) {
      return original(jid, content, options);
    }

    const previous = chains.get(jid) || Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(() => run(jid, content, options));

    chains.set(jid, next);
    next
      .finally(() => {
        if (chains.get(jid) === next) chains.delete(jid);
      })
      .catch(() => {});

    return next;
  };

  sock.__humanized = true;
  return sock;
}

module.exports = { humanize };
